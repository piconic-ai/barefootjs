/**
 * build-to-memory — compile a SINGLE Barefoot component to in-memory artifacts.
 *
 * This is the isomorphic, browser-safe heart shared by the playground's two
 * single-component compile paths:
 *   - compile-app-core's `compileComponent` (runtime, per-session user pages), and
 *   - build-registry's `compileRegistryComponent` (offline, the fixed ui registry).
 *
 * Both ran `listComponentFunctions` + `compileJSX` with the same HonoAdapter and
 * the same error-filter / FileOutput-extraction body; they differed only in a
 * couple of flags (whether to rewrite relative sibling imports, whether to strip
 * `@bf-child:` placeholders) and in which exported names they reported. Those
 * differences are now options on `buildComponentToMemory`.
 *
 * Browser-safety contract: this module is imported (via compile-app-core) into
 * the browser compile worker bundle, so it MUST NOT touch `node:fs`/Bun/Node-only
 * APIs — only `@barefootjs/jsx` + `@barefootjs/hono` + string ops.
 */

import {
  compileJSX,
  listComponentFunctions,
  type FileOutput,
} from '@barefootjs/jsx'
import { HonoAdapter } from '@barefootjs/hono'

/**
 * Distinct static base so the runtime-compiled app's asset routes never collide
 * with the prebuilt app path. The host serves assets under this base; the
 * renderer references it (import map + uno.css link) and the HonoAdapter emits
 * client-JS / barefoot.js URLs under it. Canonical home: importers (both
 * compile-app-core and build-registry) take it from here.
 */
export const STATIC_BASE = '/__rt-static/components/'

/**
 * The HonoAdapter the playground compiles every component with. Both the runtime
 * user-component path and the offline registry path share these options, so the
 * served client-JS / barefoot.js URLs line up across the two.
 */
export function makeAdapter(): HonoAdapter {
  return new HonoAdapter({
    clientJsBasePath: STATIC_BASE,
    barefootJsPath: `${STATIC_BASE}barefoot.js`,
  })
}

export interface CompileToMemoryOptions {
  /**
   * The `scriptBaseName` passed to `compileJSX` — used by the adapter to name
   * this component's emitted client-JS asset. Callers pass the on-disk base name
   * (user pages) or the registry entry name (registry components).
   */
  scriptBaseName: string
  /**
   * Local-import prefixes the compiler treats as CHILD components rather than
   * opaque external imports. Defaults to `['@/']` (the AI's `@/components/ui/*`
   * registry imports), which both callers use.
   */
  localImportPrefixes?: string[]
  /**
   * Optional rewrite for a component's relative sibling import specifiers (e.g.
   * the registry's `../slot` → `./ui_slot.js`). Passed straight through to
   * `compileJSX`. Omitted by the user-page path.
   */
  rewriteRelativeImport?: (spec: string) => string
  /**
   * Whether to strip `@bf-child:` placeholder imports from the compiled client
   * JS. The user-page path sets this `true` (registry children self-register via
   * their own served client JS, so the placeholder import — a non-resolvable
   * comment-string specifier — must be dropped before the module reaches the
   * browser ESM loader). The registry build leaves them (`false`) and runs
   * `combineParentChildClientJs` over the raw output itself.
   */
  stripChildPlaceholders?: boolean
}

/** One compiled Barefoot component as in-memory artifacts. */
export interface CompiledComponent {
  /**
   * The PascalCase component names this module exports, in source order. The
   * user-page path treats the LAST as the page entry; the registry path reports
   * all of them in its AI-facing summary.
   */
  names: string[]
  /** The compiled SSR template (markedTemplate FileOutput), pre-transpile. */
  ssrTemplate: string
  /** The hydration client JS (clientJs FileOutput; empty string if none). */
  clientJs: string
}

/**
 * Remove `@bf-child:` placeholder imports from compiled client JS. These mark
 * child-component dependencies for the site build's inliner; in the playground
 * the registry children are pre-compiled and self-register via their own served
 * client JS, so the placeholder import (a non-resolvable comment-string
 * specifier) must be dropped before the module reaches the browser loader.
 */
export function stripChildPlaceholders(clientJs: string): string {
  return clientJs.replace(/import\s+'\/\* @bf-child:\w+ \*\/'\n?/g, '')
}

/**
 * Compile a single Barefoot component `source` (`filePath` is a virtual path for
 * diagnostics) to its in-memory SSR template + client JS, using the exact
 * in-process path `bf build` uses (`compileJSX` + the shared `HonoAdapter`).
 * Throws on no component function, any error-severity diagnostic, or a missing
 * SSR template.
 */
export function buildComponentToMemory(
  source: string,
  filePath: string,
  opts: CompileToMemoryOptions,
): CompiledComponent {
  const names = listComponentFunctions(source, filePath)
  if (names.length === 0) {
    throw new Error(`No component function found in ${filePath}`)
  }

  const result = compileJSX(source, filePath, {
    adapter: makeAdapter(),
    scriptBaseName: opts.scriptBaseName,
    siblingTemplatesRegistered: true,
    localImportPrefixes: opts.localImportPrefixes ?? ['@/'],
    ...(opts.rewriteRelativeImport
      ? { rewriteRelativeImport: opts.rewriteRelativeImport }
      : {}),
  })

  const errors = result.errors.filter((e) => e.severity === 'error')
  if (errors.length > 0) {
    throw new Error(
      `compileJSX errors for ${filePath}:\n` +
        errors.map((e) => `[${e.code ?? '?'}] ${e.message}`).join('\n'),
    )
  }

  const files: FileOutput[] = result.files
  const tpl = files.find((f) => f.type === 'markedTemplate')
  const cjs = files.find((f) => f.type === 'clientJs')
  if (!tpl) throw new Error(`No SSR template emitted for ${filePath}`)

  const rawClientJs = cjs?.content ?? ''
  return {
    names,
    ssrTemplate: tpl.content,
    clientJs: opts.stripChildPlaceholders
      ? stripChildPlaceholders(rawClientJs)
      : rawClientJs,
  }
}
