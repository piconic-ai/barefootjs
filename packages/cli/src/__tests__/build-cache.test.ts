import { describe, test, expect } from 'bun:test'
import {
  emptyCache,
  findReverseDependents,
  hashContent,
  isEntryFresh,
  loadCache,
  saveCache,
  type CacheEntry,
} from '../lib/build-cache'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

function makeEntry(hash: string, deps: Record<string, string>): CacheEntry {
  return { hash, deps, outputs: [], manifestKey: null }
}

describe('hashContent', () => {
  test('is stable for identical content', () => {
    expect(hashContent('hello')).toBe(hashContent('hello'))
  })

  test('differs for different content', () => {
    expect(hashContent('hello')).not.toBe(hashContent('world'))
  })
})

describe('isEntryFresh', () => {
  const entry = makeEntry('src-hash-1', {
    '/abs/dep-a.tsx': 'dep-a-hash-1',
    '/abs/dep-b.tsx': 'dep-b-hash-1',
  })
  const lookup = (hashes: Record<string, string>) => (p: string): string | null =>
    hashes[p] ?? null

  test('fresh when source and all deps match', () => {
    expect(
      isEntryFresh(entry, 'src-hash-1', lookup({
        '/abs/dep-a.tsx': 'dep-a-hash-1',
        '/abs/dep-b.tsx': 'dep-b-hash-1',
      })),
    ).toBe(true)
  })

  test('stale when source hash differs', () => {
    expect(
      isEntryFresh(entry, 'src-hash-2', lookup({
        '/abs/dep-a.tsx': 'dep-a-hash-1',
        '/abs/dep-b.tsx': 'dep-b-hash-1',
      })),
    ).toBe(false)
  })

  test('stale when a dep hash differs', () => {
    expect(
      isEntryFresh(entry, 'src-hash-1', lookup({
        '/abs/dep-a.tsx': 'dep-a-hash-CHANGED',
        '/abs/dep-b.tsx': 'dep-b-hash-1',
      })),
    ).toBe(false)
  })

  test('stale when a dep was deleted (lookup returns null)', () => {
    expect(
      isEntryFresh(entry, 'src-hash-1', lookup({
        '/abs/dep-a.tsx': 'dep-a-hash-1',
      })),
    ).toBe(false)
  })
})

describe('findReverseDependents', () => {
  const cache = emptyCache('global-hash')
  cache.entries['/abs/parent.tsx'] = makeEntry('p', {
    '/abs/child.tsx': 'c',
  })
  cache.entries['/abs/sibling.tsx'] = makeEntry('s', {
    '/abs/other.tsx': 'o',
  })

  test('includes entries whose deps contain a changed path', () => {
    const affected = findReverseDependents(cache, ['/abs/child.tsx'])
    expect([...affected]).toEqual(['/abs/parent.tsx'])
  })

  test('returns empty when no entry depends on the change', () => {
    const affected = findReverseDependents(cache, ['/abs/unknown.tsx'])
    expect(affected.size).toBe(0)
  })
})

describe('loadCache / saveCache', () => {
  test('round-trips through disk', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bf-cache-'))
    try {
      const cache = emptyCache('gh')
      cache.entries['/abs/a.tsx'] = makeEntry('h', { '/abs/b.tsx': 'bh' })
      await saveCache(dir, cache)
      const loaded = await loadCache(dir)
      expect(loaded).not.toBeNull()
      expect(loaded!.globalHash).toBe('gh')
      expect(loaded!.entries['/abs/a.tsx'].deps['/abs/b.tsx']).toBe('bh')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('returns null when cache file is absent', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bf-cache-'))
    try {
      expect(await loadCache(dir)).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('returns null when cache version mismatches', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bf-cache-'))
    try {
      await Bun.write(join(dir, '.buildcache.json'), JSON.stringify({ version: 999, globalHash: '', entries: {} }))
      expect(await loadCache(dir)).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
