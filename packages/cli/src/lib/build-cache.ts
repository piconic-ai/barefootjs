// Incremental build cache: tracks per-source hashes, dependency hashes, and
// produced output paths so unchanged components can skip recompilation.

import { resolve } from 'node:path'

export const CACHE_VERSION = 1
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
}

export interface BuildCache {
  version: number
  /** Invalidates every entry when it changes (config file, compiler version, etc.) */
  globalHash: string
  entries: Record<string, CacheEntry>
}

/** Hash a string via Bun.hash; short hex is plenty for collision-resistant equality checks. */
export function hashContent(content: string): string {
  return Bun.hash(content).toString(16)
}

export function emptyCache(globalHash: string): BuildCache {
  return { version: CACHE_VERSION, globalHash, entries: {} }
}

export async function loadCache(outDir: string): Promise<BuildCache | null> {
  const path = resolve(outDir, CACHE_FILENAME)
  const file = Bun.file(path)
  if (!(await file.exists())) return null
  try {
    const parsed = JSON.parse(await file.text()) as BuildCache
    if (parsed.version !== CACHE_VERSION) return null
    return parsed
  } catch {
    return null
  }
}

export async function saveCache(outDir: string, cache: BuildCache): Promise<void> {
  const path = resolve(outDir, CACHE_FILENAME)
  await Bun.write(path, JSON.stringify(cache, null, 2))
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
