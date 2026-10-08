/**
 * Monaco type bundle for the playground editor.
 *
 * Monaco's TypeScript worker has no file system. Every declaration it can
 * see is registered through `addExtraLib` under a virtual
 * `file:///node_modules/…` path, and module resolution runs against those
 * paths alone. A declaration that re-exports from a file the bundle does not
 * carry therefore resolves to nothing, and the editor silently types every
 * import that flows through it as `any` — which is how `createSignal` showed
 * up untyped when the bundle carried `@barefootjs/client/index.d.ts` alone.
 *
 * So the bundle is not a hand-picked file list. It is the transitive closure
 * of the entry declarations, computed with TypeScript's own resolver over a
 * virtual tree that mirrors each package's published layout
 * (`dist/<rel>` ↔ `/node_modules/@barefootjs/<pkg>/<rel>`, the layout
 * `publishConfig.exports` ships). A specifier that resolves nowhere is a
 * build error here, not an `any` in the editor.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import ts from 'typescript'

const PKG_DIR = resolve(import.meta.dir, '../../../packages')

type BundledPackage = {
  /** Package directory (where `bun run build:types` emits `dist/`). */
  pkgDir: string
  /** Emitted declaration tree, served at `/node_modules/<name>/`. */
  distDir: string
  /** A declaration the tree must contain; missing means `build:types` has not run. */
  probe: string
}

/**
 * Packages the editor can resolve into, keyed by package name. No virtual
 * package.json is needed: the emitted tree already places `reactive.d.ts`,
 * `jsx-runtime/index.d.ts`, … where node10 subpath resolution looks.
 */
const PACKAGES: Record<string, BundledPackage> = {
  '@barefootjs/client': bundledPackage('client', 'index.d.ts'),
  '@barefootjs/jsx': bundledPackage('jsx', 'jsx-runtime/index.d.ts'),
  '@barefootjs/hono': bundledPackage('adapter-hono', 'jsx/jsx-runtime/index.d.ts'),
  '@barefootjs/shared': bundledPackage('shared', 'index.d.ts'),
}

function bundledPackage(dir: string, probe: string): BundledPackage {
  const pkgDir = resolve(PKG_DIR, dir)
  return { pkgDir, distDir: join(pkgDir, 'dist'), probe }
}

/**
 * Where the closure starts: the signals API the playground source imports,
 * and the JSX runtime `jsxImportSource` points at (page-script.ts).
 * Everything else is pulled in by what these reference.
 */
const ENTRY_FILES = [
  '/node_modules/@barefootjs/client/index.d.ts',
  '/node_modules/@barefootjs/hono/jsx/jsx-runtime/index.d.ts',
]

// Minimal shims for the `hono/jsx` + `hono/jsx/jsx-runtime` modules the
// @barefootjs/hono declarations reference. Without these Monaco would emit
// "Cannot find module 'hono/jsx…'" diagnostics once semantic validation is
// on. We only need the shapes used by the JSX namespace surface.
const HONO_JSX_SHIM = `declare module 'hono/jsx' {
  export namespace JSX {
    type Element = unknown
  }
  export type JSXNode = unknown
}
`
const HONO_JSX_RUNTIME_SHIM = `declare module 'hono/jsx/jsx-runtime' {
  export namespace JSX {
    type Element = unknown
  }
  type Props = Record<string, unknown>
  export function jsx(tag: string | Function, props: Props, key?: string): unknown
  export const jsxs: typeof jsx
  export function Fragment(props: { children?: unknown }): unknown
  export function jsxAttr(name: string, value: unknown): string
  export function jsxEscape(value: unknown): string
  export function jsxTemplate(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): unknown
}
`
const SHIMS: Record<string, string> = {
  '/node_modules/hono/jsx/index.d.ts': HONO_JSX_SHIM,
  '/node_modules/hono/jsx/jsx-runtime/index.d.ts': HONO_JSX_RUNTIME_SHIM,
}

/**
 * How Monaco resolves specifiers: page-script.ts sets
 * `ModuleResolutionKind.NodeJs`, i.e. node10 — no `exports` map, plain
 * `<pkg>/<sub>.d.ts` / `<pkg>/<sub>/index.d.ts` lookups.
 */
export const RESOLUTION_OPTIONS: ts.CompilerOptions = {
  moduleResolution: ts.ModuleResolutionKind.Node10,
}

function toRealPath(virtualPath: string): string | undefined {
  for (const [name, { distDir }] of Object.entries(PACKAGES)) {
    const prefix = `/node_modules/${name}/`
    if (virtualPath.startsWith(prefix)) return join(distDir, virtualPath.slice(prefix.length))
  }
  return undefined
}

function readVirtual(virtualPath: string): string | undefined {
  if (virtualPath in SHIMS) return SHIMS[virtualPath]
  const real = toRealPath(virtualPath)
  if (real === undefined || !existsSync(real)) return undefined
  return readFileSync(real, 'utf8')
}

/** Emits a package's declarations when its probe file is missing. */
export async function ensureDeclarations(): Promise<void> {
  for (const [name, { pkgDir, distDir, probe }] of Object.entries(PACKAGES)) {
    const probeFile = join(distDir, probe)
    if (existsSync(probeFile)) continue
    console.log(`Building ${name} declarations for playground types…`)
    const proc = Bun.spawn(['bun', 'run', 'build:types'], {
      cwd: pkgDir,
      stdout: 'inherit',
      stderr: 'inherit',
    })
    if ((await proc.exited) !== 0 || !existsSync(probeFile)) {
      throw new Error(`Failed to build ${name} declarations (${probeFile} missing)`)
    }
  }
}

/**
 * The bundle, keyed the way Monaco's `addExtraLib` expects
 * (`file:///node_modules/…`). Call `ensureDeclarations()` first.
 */
export function buildPlaygroundTypesBundle(): Record<string, string> {
  const host: ts.ModuleResolutionHost = {
    fileExists: (path) => readVirtual(path) !== undefined,
    readFile: readVirtual,
  }
  const bundle: Record<string, string> = {}
  const queue = [...ENTRY_FILES]
  while (queue.length > 0) {
    const file = queue.pop()!
    const key = `file://${file}`
    if (key in bundle) continue
    const text = readVirtual(file)
    if (text === undefined) {
      throw new Error(`Playground type bundle: ${file} does not exist (run build:types for its package)`)
    }
    bundle[key] = text
    for (const { fileName: specifier } of ts.preProcessFile(text, true, false).importedFiles) {
      const resolved = ts.resolveModuleName(specifier, file, RESOLUTION_OPTIONS, host).resolvedModule
      if (!resolved) {
        throw new Error(
          `Playground type bundle: '${specifier}' (imported by ${file}) resolves to nothing — ` +
            'add its package to PACKAGES or a shim to SHIMS',
        )
      }
      queue.push(resolved.resolvedFileName)
    }
  }
  return bundle
}
