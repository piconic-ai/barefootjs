// Incremental build cache: tracks per-source hashes, dependency hashes, and
// produced output paths so unchanged components can skip recompilation.

import { resolve } from 'node:path'
import { fileExists, hashString, readText, writeText } from './runtime'

export const CACHE_FILENAME = '.buildcache.json'

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
  manifestEntry?: { markedTemplate: string; clientJs?: string }
  /** Key used to register this entry's types with the postBuild hook */
  typesKey?: string
  /** Adapter-generated types (e.g. Go structs). Restored on cache hit so the
   *  postBuild hook sees types from every component, not just freshly compiled ones. */
  types?: string
}

export interface BuildCache {
  /** Invalidates every entry when it changes. Includes the CLI package.json so
   *  any library upgrade (and therefore any change to the cache schema that
   *  ships with it) implicitly discards the old cache. */
  globalHash: string
  entries: Record<string, CacheEntry>
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
