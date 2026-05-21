import { describe, test, expect } from 'bun:test'
import {
  emptyLedger,
  EMIT_LEDGER_FILENAME,
  EMIT_LEDGER_VERSION,
  extractLedgerFromCache,
  loadEmitLedger,
  saveEmitLedger,
} from '../lib/emit-ledger'
import { emptyCache } from '../lib/build-cache'
import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

describe('loadEmitLedger / saveEmitLedger', () => {
  test('round-trips through disk using project-relative on-disk keys', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bf-ledger-'))
    try {
      // Keys are absolute paths in-memory (they match the build's
      // `entryPath` / `bundle:<abs>` shape elsewhere in the pipeline),
      // but the on-disk form is project-relative — see comment in
      // emit-ledger.ts for the absolute-paths-leak motivation.
      const projectDir = dir
      const counterAbs = resolve(projectDir, 'components/Counter.tsx')
      const bundleAbs = resolve(projectDir, 'src/app.ts')
      const ledger = emptyLedger()
      ledger.entries[counterAbs] = [
        'components/Counter.client.js',
        'components/Counter.tsx',
      ]
      ledger.entries[`bundle:${bundleAbs}`] = ['components/app.js']
      await saveEmitLedger(dir, projectDir, ledger)

      // On-disk shape must not contain the developer's absolute paths
      // — keys are project-relative so the file is safe to deploy
      // (e.g. as part of Hono's wrangler `public/` bundle).
      const raw = readFileSync(join(dir, EMIT_LEDGER_FILENAME), 'utf8')
      expect(raw).toContain('components/Counter.tsx')
      expect(raw).not.toContain(counterAbs)
      expect(raw).not.toContain(bundleAbs)

      const loaded = await loadEmitLedger(dir, projectDir)
      expect(loaded).not.toBeNull()
      expect(loaded!.version).toBe(EMIT_LEDGER_VERSION)
      // In-memory shape is restored to absolute keys so the cleanup
      // pass can look up by entryPath without further re-keying.
      expect(loaded!.entries[counterAbs]).toEqual([
        'components/Counter.client.js',
        'components/Counter.tsx',
      ])
      expect(loaded!.entries[`bundle:${bundleAbs}`]).toEqual(['components/app.js'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('returns null when ledger file is absent', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bf-ledger-'))
    try {
      expect(await loadEmitLedger(dir, dir)).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('returns null when ledger file is malformed', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bf-ledger-'))
    try {
      await Bun.write(join(dir, EMIT_LEDGER_FILENAME), '{ not valid json')
      expect(await loadEmitLedger(dir, dir)).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  // Older ledger shapes must be treated as absent so a build with a stale
  // shape on disk does not crash on missing fields or feed half-parsed
  // garbage into the cleanup pass. The next build will rewrite the file
  // in the new shape.
  test('returns null when version is mismatched', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bf-ledger-'))
    try {
      await Bun.write(
        join(dir, EMIT_LEDGER_FILENAME),
        JSON.stringify({ version: 999, entries: {} }),
      )
      expect(await loadEmitLedger(dir, dir)).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('returns null when entries field is missing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bf-ledger-'))
    try {
      await Bun.write(
        join(dir, EMIT_LEDGER_FILENAME),
        JSON.stringify({ version: EMIT_LEDGER_VERSION }),
      )
      expect(await loadEmitLedger(dir, dir)).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  // Per-entry shape gate. The cleanup pass does `for (const output of
  // previousOutputs)` and passes each `output` to `unlink`, so a
  // non-iterable / non-string slipped past validation would either crash
  // mid-cleanup or call `unlink` on garbage. Reject the whole file
  // instead — the next build rewrites a clean ledger.
  test('returns null when an entry value is not a string array', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bf-ledger-'))
    try {
      await Bun.write(
        join(dir, EMIT_LEDGER_FILENAME),
        JSON.stringify({
          version: EMIT_LEDGER_VERSION,
          entries: { 'components/X.tsx': 'not-an-array' },
        }),
      )
      expect(await loadEmitLedger(dir, dir)).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('returns null when an entry value is an array containing non-strings', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bf-ledger-'))
    try {
      await Bun.write(
        join(dir, EMIT_LEDGER_FILENAME),
        JSON.stringify({
          version: EMIT_LEDGER_VERSION,
          entries: { 'components/X.tsx': ['components/X.tsx', 123, null] },
        }),
      )
      expect(await loadEmitLedger(dir, dir)).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  // `typeof [] === 'object'` would slip past a naive object check.
  // Reject array shapes for both the top-level value and `entries` so
  // the cleanup pass never treats numeric indices as source keys.
  test('returns null when the parsed ledger is an array', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bf-ledger-'))
    try {
      await Bun.write(join(dir, EMIT_LEDGER_FILENAME), JSON.stringify([]))
      expect(await loadEmitLedger(dir, dir)).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('returns null when entries is an array', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bf-ledger-'))
    try {
      await Bun.write(
        join(dir, EMIT_LEDGER_FILENAME),
        JSON.stringify({ version: EMIT_LEDGER_VERSION, entries: [] }),
      )
      expect(await loadEmitLedger(dir, dir)).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  // Edge case: source files outside `projectDir` (rare, but possible in
  // monorepo cross-package compilation) keep their absolute key as-is.
  // Re-keying them under `../../../...` would still leak structure AND
  // break the round-trip invariant when projectDir relocates.
  test('preserves absolute keys for sources outside projectDir', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bf-ledger-'))
    const otherDir = mkdtempSync(join(tmpdir(), 'bf-ledger-other-'))
    try {
      const outsideAbs = resolve(otherDir, 'External.tsx')
      const ledger = emptyLedger()
      ledger.entries[outsideAbs] = ['components/External.client.js']
      await saveEmitLedger(dir, dir, ledger)
      const loaded = await loadEmitLedger(dir, dir)
      expect(loaded!.entries[outsideAbs]).toEqual(['components/External.client.js'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
      rmSync(otherDir, { recursive: true, force: true })
    }
  })
})

// Bootstrap path used on the first build after upgrade: the user has a
// `.buildcache.json` from a previous CLI version but no `.bfemit.json` yet,
// so we project the cache's `entries[*].outputs` into ledger shape to keep
// pre-existing orphans pruneable.
describe('extractLedgerFromCache', () => {
  test('projects cache entries with outputs into ledger shape', () => {
    const cache = emptyCache('gh')
    cache.entries['/abs/Counter.tsx'] = {
      hash: 'h',
      deps: {},
      outputs: ['components/Counter.client.js', 'components/Counter.tsx'],
      manifestKey: 'Counter',
    }
    cache.entries['bundle:/abs/app.ts'] = {
      hash: 'h',
      deps: {},
      outputs: ['components/app.js'],
      manifestKey: null,
    }
    const projected = extractLedgerFromCache(cache)
    expect(projected['/abs/Counter.tsx']).toEqual([
      'components/Counter.client.js',
      'components/Counter.tsx',
    ])
    expect(projected['bundle:/abs/app.ts']).toEqual(['components/app.js'])
  })

  test('skips entries with empty outputs', () => {
    const cache = emptyCache('gh')
    cache.entries['/abs/ServerOnly.tsx'] = {
      hash: 'h',
      deps: {},
      outputs: [],
      manifestKey: null,
    }
    expect(extractLedgerFromCache(cache)).toEqual({})
  })

  test('returns empty object for null cache', () => {
    expect(extractLedgerFromCache(null)).toEqual({})
  })

  // `loadCache` only validates the top-level shape; a partially-
  // corrupted or hand-edited file can land here with `entries` as
  // `null` or an array. Bootstrap is best-effort, so degrade to an
  // empty projection instead of throwing on `Object.entries(null)`.
  test('returns empty object when cache.entries is null', () => {
    const cache = { globalHash: 'gh', entries: null as unknown as Record<string, never> }
    expect(extractLedgerFromCache(cache as never)).toEqual({})
  })

  test('returns empty object when cache.entries is an array', () => {
    const cache = { globalHash: 'gh', entries: [] as unknown as Record<string, never> }
    expect(extractLedgerFromCache(cache as never)).toEqual({})
  })

  // The cache file goes through `loadCache` which only validates the
  // top-level shape (`globalHash`, `entries`). A hand-edited or partially-
  // upgraded `.buildcache.json` could carry a string / number / nested
  // object in `outputs` and slip through; bootstrap must reject those
  // values rather than feed them to the cleanup pass. Skipping (not
  // throwing) keeps bootstrap best-effort by design.
  test('skips entries whose outputs are not a string array', () => {
    const cache = emptyCache('gh')
    // Hand-craft malformed shapes that would type-error in fresh code
    // but can land here from old or tampered on-disk cache files.
    cache.entries['/abs/Good.tsx'] = {
      hash: 'h',
      deps: {},
      outputs: ['components/Good.client.js'],
      manifestKey: null,
    }
    cache.entries['/abs/BadString.tsx'] = {
      hash: 'h',
      deps: {},
      outputs: 'components/Bad.client.js' as unknown as string[],
      manifestKey: null,
    }
    cache.entries['/abs/BadMixed.tsx'] = {
      hash: 'h',
      deps: {},
      outputs: ['components/X.tsx', 42 as unknown as string],
      manifestKey: null,
    }
    const projected = extractLedgerFromCache(cache)
    expect(projected['/abs/Good.tsx']).toEqual(['components/Good.client.js'])
    expect(projected['/abs/BadString.tsx']).toBeUndefined()
    expect(projected['/abs/BadMixed.tsx']).toBeUndefined()
  })
})
