// `pickGeneratedAt` decides whether `ui/meta/index.json` gets a fresh
// `generatedAt` timestamp or keeps the previous one. It exists purely so
// `update-meta.yml` (and `bun run meta:extract` locally) don't produce
// a 1-line `generatedAt` diff on every run — which would otherwise
// trigger noisy auto-commits even when nothing real changed.

import { describe, test, expect } from 'bun:test'
import { pickGeneratedAt } from '../commands/meta-extract'
import type { MetaIndexEntry } from '../lib/types'

const entries: MetaIndexEntry[] = [
  {
    name: 'button',
    title: 'Button',
    category: 'input',
    description: 'desc',
    tags: [],
    stateful: false,
  },
]

const FIXED_NOW = '2026-05-20T10:00:00.000Z'
const fakeNow = () => FIXED_NOW

describe('pickGeneratedAt', () => {
  test('returns fresh timestamp when no previous index.json exists', () => {
    expect(pickGeneratedAt(null, entries, fakeNow)).toBe(FIXED_NOW)
  })

  test('preserves previous timestamp when components are byte-identical', () => {
    const prev = JSON.stringify({
      version: 1,
      generatedAt: '2026-01-01T00:00:00.000Z',
      components: entries,
    })
    expect(pickGeneratedAt(prev, entries, fakeNow)).toBe('2026-01-01T00:00:00.000Z')
  })

  test('returns fresh timestamp when components actually changed', () => {
    const prev = JSON.stringify({
      version: 1,
      generatedAt: '2026-01-01T00:00:00.000Z',
      components: [{ ...entries[0], description: 'old desc' }],
    })
    expect(pickGeneratedAt(prev, entries, fakeNow)).toBe(FIXED_NOW)
  })

  test('returns fresh timestamp when previous JSON is malformed', () => {
    expect(pickGeneratedAt('not-json', entries, fakeNow)).toBe(FIXED_NOW)
  })

  test('treats undefined optional fields as identical to omitted fields', () => {
    // JSON.stringify drops undefined values, so this should still match.
    const prev = JSON.stringify({
      version: 1,
      generatedAt: '2026-01-01T00:00:00.000Z',
      components: entries,
    })
    const nextWithUndef: MetaIndexEntry[] = [{ ...entries[0], subComponents: undefined }]
    expect(pickGeneratedAt(prev, nextWithUndef, fakeNow)).toBe('2026-01-01T00:00:00.000Z')
  })
})
