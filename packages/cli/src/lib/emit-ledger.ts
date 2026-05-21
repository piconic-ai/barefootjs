// Durable record of "what did the last build emit?", kept independent of the
// per-entry build cache so orphan-output cleanup keeps working when the cache
// is wiped — e.g. `bf build --force`, or any globalHash change from a
// `bun install` / `barefoot.config.ts` edit.
//
// Background (piconic-ai/barefootjs#1455): the existing cleanup pass in
// `build.ts` discovers orphaned output files by walking `cache.entries`. When
// the cache is dropped, `cache.entries` is empty and the pass deletes nothing,
// so previously-emitted client JS / templates for sources that have since
// been deleted (or renamed, or had their output layout changed) survive the
// rebuild and accumulate in `outDir`.
//
// The ledger stores `{ sourceKey → emitted output paths (relative to outDir) }`
// in `.bfemit.json` next to `.buildcache.json`. The two files share a key
// space (entry path for components, `bundle:<abs>` for bundle entries) but
// have separate lifecycles: the cache invalidates when compilation inputs
// change, the ledger only changes when outputs change.

import { isAbsolute, relative, resolve } from 'node:path'
import { fileExists, readText } from './runtime'
import { writeIfChanged } from './fs-utils'
import type { BuildCache } from './build-cache'

export const EMIT_LEDGER_FILENAME = '.bfemit.json'

/**
 * Bump when the on-disk shape changes incompatibly. Older versions are
 * treated as absent so a build proceeds without trying to read a stale
 * shape — the new shape is rewritten at the end of the build.
 */
export const EMIT_LEDGER_VERSION = 1

export interface EmitLedger {
  version: number
  /**
   * Outputs the previous build emitted, keyed by stable source identifier.
   *   - Component entries: absolute path of the source `.tsx` file.
   *   - Bundle entries: `bundle:<abs-entry-path>`.
   * Values are output paths relative to `outDir`.
   */
  entries: Record<string, string[]>
}

export function emptyLedger(): EmitLedger {
  return { version: EMIT_LEDGER_VERSION, entries: {} }
}

/**
 * Validate that a value is `string[]`. Used at the JSON boundary in
 * `loadEmitLedger` and `extractLedgerFromCache` so a corrupted or
 * hand-edited file can't smuggle non-iterable / non-string values into
 * the cleanup pass, which would either throw on `for (const output of
 * previousOutputs)` or pass a wrong-typed path to `unlink`.
 */
function isStringArray(v: unknown): v is string[] {
  if (!Array.isArray(v)) return false
  for (const item of v) {
    if (typeof item !== 'string') return false
  }
  return true
}

/**
 * Synthetic key prefix used in both `BuildCache.entries` and
 * `EmitLedger.entries` for entries that come from `config.bundleEntries`
 * (esbuild-bundled JS) rather than from a discovered `.tsx` source. The
 * suffix is the bundle's absolute entry path. Exported so the build
 * pipeline keeps a single source of truth instead of re-spelling the
 * prefix at every call site.
 */
export const BUNDLE_KEY_PREFIX = 'bundle:'

/**
 * Convert an in-memory ledger key (absolute source path, or
 * `bundle:<abs>`) to its on-disk form (project-relative, or
 * `bundle:<rel>`). For adapters where `outDir` is a public/static dir
 * (Hono's `public/`), the ledger ships with deployed assets — keeping
 * keys project-relative avoids leaking the developer's machine paths
 * (`/Users/<name>/...`) into the deploy bundle.
 *
 * Sources outside `projectDir` (rare, but possible in monorepo
 * cross-package compilation) keep their absolute key as-is: re-keying
 * them under `../../../...` would still leak structure and break the
 * round-trip invariant. The on-disk shape stays a flat
 * `Record<string, string[]>` either way.
 */
function normalizeKey(absKey: string, projectDir: string): string {
  if (absKey.startsWith(BUNDLE_KEY_PREFIX)) {
    const inner = absKey.slice(BUNDLE_KEY_PREFIX.length)
    const rel = relative(projectDir, inner)
    if (!rel || rel.startsWith('..') || isAbsolute(rel)) return absKey
    return BUNDLE_KEY_PREFIX + rel
  }
  const rel = relative(projectDir, absKey)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) return absKey
  return rel
}

/**
 * Inverse of `normalizeKey`: an on-disk relative key becomes an
 * absolute in-memory key. Absolute keys (out-of-project edge case) pass
 * through unchanged so the round trip is lossless.
 */
function denormalizeKey(diskKey: string, projectDir: string): string {
  if (diskKey.startsWith(BUNDLE_KEY_PREFIX)) {
    const inner = diskKey.slice(BUNDLE_KEY_PREFIX.length)
    if (isAbsolute(inner)) return diskKey
    return BUNDLE_KEY_PREFIX + resolve(projectDir, inner)
  }
  if (isAbsolute(diskKey)) return diskKey
  return resolve(projectDir, diskKey)
}

export async function loadEmitLedger(
  outDir: string,
  projectDir: string,
): Promise<EmitLedger | null> {
  const path = resolve(outDir, EMIT_LEDGER_FILENAME)
  if (!(await fileExists(path))) return null
  try {
    const parsed = JSON.parse(await readText(path)) as EmitLedger
    // `typeof [] === 'object'` and `typeof null === 'object'` would both
    // slip past a naive object check; reject explicitly so the cleanup
    // pass only ever sees the intended `Record<string, string[]>` shape.
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed) ||
      parsed.version !== EMIT_LEDGER_VERSION ||
      typeof parsed.entries !== 'object' ||
      parsed.entries === null ||
      Array.isArray(parsed.entries)
    ) {
      return null
    }
    // Per-entry shape check: every value must be `string[]`. A single bad
    // value invalidates the whole ledger — safer than silently dropping
    // entries because the next build will rewrite the file from scratch.
    for (const value of Object.values(parsed.entries)) {
      if (!isStringArray(value)) return null
    }
    // Re-key from on-disk (project-relative) shape to in-memory
    // (absolute) shape so the cleanup pass can look up by entryPath.
    const restored: Record<string, string[]> = {}
    for (const [diskKey, outputs] of Object.entries(parsed.entries)) {
      restored[denormalizeKey(diskKey, projectDir)] = outputs
    }
    return { version: parsed.version, entries: restored }
  } catch {
    return null
  }
}

export async function saveEmitLedger(
  outDir: string,
  projectDir: string,
  ledger: EmitLedger,
): Promise<void> {
  const path = resolve(outDir, EMIT_LEDGER_FILENAME)
  const serialized: Record<string, string[]> = {}
  for (const [absKey, outputs] of Object.entries(ledger.entries)) {
    serialized[normalizeKey(absKey, projectDir)] = outputs
  }
  const onDisk: EmitLedger = { version: ledger.version, entries: serialized }
  // `writeIfChanged` skips the write when bytes match — keeps idle
  // `bf build --watch` cycles from re-tripping file watchers (the dev
  // sentinel at `<outDir>/.dev/build-id` and any host-side watchers on
  // `outDir/`) when the emit set didn't actually shift.
  await writeIfChanged(path, JSON.stringify(onDisk, null, 2))
}

/**
 * Project a `BuildCache.entries` map into the ledger's `entries` shape.
 *
 * Used as a one-shot migration on the first build after upgrading: a user
 * whose previous build wrote `.buildcache.json` but no `.bfemit.json` still
 * gets their pre-existing orphans pruned, instead of having to wait until
 * the cycle after this build to seed the ledger.
 *
 * `loadCache` doesn't validate the per-entry schema, so we re-check
 * `entry.outputs` here. A malformed value is skipped rather than throwing
 * — bootstrap is best-effort by design.
 */
export function extractLedgerFromCache(cache: BuildCache | null): Record<string, string[]> {
  if (!cache) return {}
  // `loadCache` only validates the cache's top-level shape, so
  // `cache.entries` could still arrive as `null` or an array from a
  // tampered / mid-upgrade file. Guard before iterating so bootstrap
  // stays best-effort instead of throwing on `Object.entries(null)`.
  const entries = cache.entries
  if (typeof entries !== 'object' || entries === null || Array.isArray(entries)) {
    return {}
  }
  const out: Record<string, string[]> = {}
  for (const [key, entry] of Object.entries(entries)) {
    if (entry && isStringArray(entry.outputs) && entry.outputs.length > 0) {
      out[key] = entry.outputs.slice()
    }
  }
  return out
}
