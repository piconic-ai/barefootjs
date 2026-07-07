// Incremental build cache: tracks per-source hashes, dependency hashes, and
// produced output paths so unchanged components can skip recompilation.

import { resolve } from 'node:path'
import { fileExists, hashString, readText, writeText } from './runtime'

export const CACHE_FILENAME = '.buildcache.json'

/**
 * Per-exported-component row inside a manifest entry's `components` map.
 * Emitted only for `templatesPerComponent` adapters, where a multi-component
 * source file (e.g. the registry's `ui/toast/index.tsx` exporting
 * ToastProvider / Toast / ToastTitle / ToastClose) compiles to one template
 * file per component. Server runtimes register one child renderer per row so
 * `render_child('toast_provider')` etc. resolve (piconic-ai/barefootjs#2132).
 */
export interface ManifestComponentEntry {
  /** Template path relative to outDir (e.g. `templates/ui/toast/Toast.html.ep`) */
  markedTemplate: string
  /** This component's statically-derived SSR defaults (see packages/jsx/src/ssr-defaults.ts) */
  ssrDefaults?: Record<string, unknown>
}

/** One source file's row in `dist/templates/manifest.json`. */
export interface ManifestEntry {
  markedTemplate: string
  clientJs?: string
  stubDeps?: string[]
  ssrDefaults?: Record<string, unknown>
  /** Per-exported-component templates for `templatesPerComponent` adapters (#2132) */
  components?: Record<string, ManifestComponentEntry>
}

export interface CacheEntry {
  /** Content hash of the source file itself */
  hash: string
  /** Hashes of every file read during compilation (imports, transitive) keyed by abs path */
  deps: Record<string, string>
  /** Relative-to-outDir paths produced for this entry */
  outputs: string[]
  /** Manifest key this entry contributes to (null when the entry produced no manifest row) */
  manifestKey: string | null
  /** Stored manifest row, so cache-hit entries can restore it without recompiling */
  manifestEntry?: ManifestEntry
  /** Key used to register this entry's types with the postBuild hook */
  typesKey?: string
  /** Adapter-generated types (e.g. Go structs). Restored on cache hit so the
   *  postBuild hook sees types from every component, not just freshly compiled ones. */
  types?: string
  /** Pre-resolve compiled client JS content. The combine step needs the
   *  original compiled output (before resolveRelativeImports rewrites it) so
   *  stale __bf_inline_N identifiers from a prior build's resolution pass
   *  don't leak into the combined file. See piconic-ai/barefootjs#1542. */
  compiledClientJs?: string
}

export interface BuildCache {
  /** Invalidates every entry when it changes. Includes the CLI package.json so
   *  any library upgrade (and therefore any change to the cache schema that
   *  ships with it) implicitly discards the old cache. */
  globalHash: string
  entries: Record<string, CacheEntry>
  /**
   * Hash of the tree-shaken runtime's inputs (the collected used-export set,
   * `runtimeBundle` mode, `minify`, and the source runtime dist file's own
   * content hash) from the last build that actually regenerated
   * `barefoot.js`. Lets an incremental build skip re-bundling the runtime
   * when nothing that would change its contents has changed, while still
   * regenerating it the moment a component starts (or stops) importing
   * something — even though that component's own recompile doesn't bump
   * `globalHash`. See `packages/cli/src/lib/runtime-treeshake.ts`.
   */
  runtimeKeepHash?: string
}

/** Hash a string for cache-equality checks. Short hex is plenty. */
export function hashContent(content: string): string {
  return hashString(content)
}

export function emptyCache(globalHash: string): BuildCache {
  return { globalHash, entries: {} }
}

export async function loadCache(outDir: string): Promise<BuildCache | null> {
  const path = resolve(outDir, CACHE_FILENAME)
  if (!(await fileExists(path))) return null
  try {
    const parsed = JSON.parse(await readText(path)) as BuildCache
    if (typeof parsed.globalHash !== 'string' || typeof parsed.entries !== 'object') {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export async function saveCache(outDir: string, cache: BuildCache): Promise<void> {
  const path = resolve(outDir, CACHE_FILENAME)
  await writeText(path, JSON.stringify(cache, null, 2))
}

/** True when the entry's source and every recorded dep still has a matching hash. */
export function isEntryFresh(
  entry: CacheEntry,
  currentSourceHash: string,
  depHash: (absPath: string) => string | null,
): boolean {
  if (entry.hash !== currentSourceHash) return false
  for (const [depPath, recordedHash] of Object.entries(entry.deps)) {
    const now = depHash(depPath)
    if (now === null || now !== recordedHash) return false
  }
  return true
}

/** Return the set of entries whose `deps` include any of `changedPaths` (reverse-dep lookup). */
export function findReverseDependents(
  cache: BuildCache,
  changedPaths: Iterable<string>,
): Set<string> {
  const changed = new Set(changedPaths)
  const affected = new Set<string>()
  for (const [src, entry] of Object.entries(cache.entries)) {
    for (const dep of Object.keys(entry.deps)) {
      if (changed.has(dep)) {
        affected.add(src)
        break
      }
    }
  }
  return affected
}
