// Resolve and inline relative imports in compiled client JS files.

import { dirname, resolve } from 'node:path'
import { RELATIVE_IMPORT_RE } from './patterns'
import { fileExists, readText, transpile, writeText } from './runtime'

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export interface ResolveRelativeImportsOptions {
  /** Absolute path to the dist directory (base for manifest paths) */
  distDir: string
  /** Build manifest: componentName -> { clientJs?, markedTemplate } */
  manifest: Record<string, { clientJs?: string; markedTemplate: string }>
  /** Source directories to search for modules (checked after the client JS file's own directory) */
  sourceDirs?: string[]
  /**
   * Per-entry source directories, keyed by manifest key. Searched after the
   * client JS file's own directory but before the global `sourceDirs`.
   *
   * The compiler emits relative imports against the source layout (e.g. a
   * `'use client'` component at `src/components/canvas/DeskCanvas.tsx`
   * importing `./useYjs` resolves to `src/components/canvas/useYjs.ts`).
   * The dist file lives at a different path with no sibling helper, so
   * without this map the resolver would silently strip the import. See
   * piconic-ai/barefootjs#1133.
   */
  sourceDirsByManifestKey?: Record<string, string[]>
}

/**
 * Result of resolving a relative import against the on-disk dist
 * layout. Each variant has a clear handling rule in
 * `inlineRelativeImports`:
 *
 *   - `external` — file exists at runtime as a separately-served
 *     artifact (e.g. `./barefoot.js` is the runtime bundle). Inlining
 *     would duplicate code; stripping the import would break runtime
 *     references. Leave the line alone.
 *   - `inline`   — `.ts` source found; transpile and splice in.
 *     `.tsx` is treated as a server component (already rendered at
 *     SSR time) and the import line is stripped instead.
 *   - `missing`  — nothing matched. Strip the import line.
 */
type ResolveResult =
  | { kind: 'external' }
  | { kind: 'inline'; path: string }
  | { kind: 'missing' }

async function resolveSourceFile(importPath: string, searchDirs: string[]): Promise<ResolveResult> {
  for (const dir of searchDirs) {
    const basePath = resolve(dir, importPath)
    // If the import path already points to an existing runtime artifact
    // (e.g. `./barefoot.js`), keep the import as-is. Without this,
    // watch's cached re-builds would silently strip the runtime import
    // line from every component's client JS, and the browser would
    // then fail with `ReferenceError: hydrate is not defined`.
    if (/\.(?:js|mjs|cjs)$/.test(importPath) && await fileExists(basePath)) {
      return { kind: 'external' }
    }
    for (const ext of ['.ts', '.tsx', '.js']) {
      if (await fileExists(basePath + ext)) return { kind: 'inline', path: basePath + ext }
    }
  }
  return { kind: 'missing' }
}

/**
 * Process a single file's relative imports, mutating `content` in place.
 * Recurses into transitively-imported `.ts` modules so that, e.g.,
 * `client.tsx → nav-data.ts → component-registry.ts` all end up inlined
 * in the right declaration order.
 */
async function inlineRelativeImports(
  content: string,
  searchDirs: string[],
  inlinedPaths: Set<string>,
  loggingPath: string
): Promise<string> {
  const re = new RegExp(RELATIVE_IMPORT_RE.source, RELATIVE_IMPORT_RE.flags)
  const matches = [...content.matchAll(re)]
  if (matches.length === 0) return content

  for (const match of matches) {
    const importPath = match[1]
    const fullMatch = match[0]
    const result = await resolveSourceFile(importPath, searchDirs)

    if (result.kind === 'external') {
      // Existing runtime artifact (e.g. ./barefoot.js); keep import as-is.
      continue
    }

    if (result.kind === 'missing' || inlinedPaths.has(result.path)) {
      content = content.replace(new RegExp(escapeRegExp(fullMatch) + '\\n?'), '')
      continue
    }

    if (result.path.endsWith('.tsx')) {
      content = content.replace(new RegExp(escapeRegExp(fullMatch) + '\\n?'), '')
      console.log(`Stripped server component import: ${importPath} from ${loggingPath}`)
      continue
    }

    inlinedPaths.add(result.path)
    const sourceContent = await readText(result.path)
    let jsCode = transpile(sourceContent, { loader: 'ts' })

    // Recursively resolve relative imports inside the inlined module before
    // stripping its import lines. Resolution is anchored to the source file's
    // own directory so transitive paths (e.g. './component-registry') resolve
    // correctly regardless of where the parent client JS lives.
    jsCode = await inlineRelativeImports(
      jsCode,
      [dirname(result.path), ...searchDirs.slice(1)],
      inlinedPaths,
      loggingPath,
    )

    // Convert exports/imports of the inlined module to plain declarations.
    // Also drop bare `export { foo, bar };` blocks emitted by the transpiler —
    // stripping just the `export` keyword leaves a stray block statement.
    jsCode = jsCode
      .replace(/^import\s+.*$/gm, '')
      .replace(/^export\s*\{[^}]*\}\s*;?\s*$/gm, '')
      .replace(/^export\s+/gm, '')
      .trim()

    content = content.replace(fullMatch, jsCode)
    console.log(`Inlined: ${importPath} into ${loggingPath}`)
  }

  return content
}

/**
 * Resolve relative imports in compiled client JS files.
 *
 * For each client JS file in the manifest:
 * - `.ts` imports: transpile and inline the code (recursively for transitive `.ts` deps)
 * - `.tsx` imports: strip (server component, already rendered at SSR time)
 * - Not found / already inlined: strip
 */
export async function resolveRelativeImports(options: ResolveRelativeImportsOptions): Promise<void> {
  const { distDir, manifest, sourceDirs = [], sourceDirsByManifestKey = {} } = options

  for (const [name, entry] of Object.entries(manifest)) {
    if (!entry.clientJs) continue
    const filePath = resolve(distDir, entry.clientJs)
    let content: string
    try {
      content = await readText(filePath)
    } catch {
      continue
    }

    const perEntryDirs = sourceDirsByManifestKey[name] ?? []
    const inlinedPaths = new Set<string>()
    const next = await inlineRelativeImports(
      content,
      [dirname(filePath), ...perEntryDirs, ...sourceDirs],
      inlinedPaths,
      entry.clientJs,
    )

    if (next !== content) {
      await writeText(filePath, next)
    }
  }
}
