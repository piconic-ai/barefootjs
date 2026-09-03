// #2785 — `support-matrix:lock`/`compat:lock` used to silently write a lock
// containing only whichever adapters happened to be built, deleting the
// rest from the committed artifact with no warning. `requireAllCompatAdapters`
// is the pure gate lock generators now go through instead of the
// degrade-to-skip `loadCompatAdapters` directly.

import { describe, test, expect } from 'bun:test'
import {
  loadAllCompatAdapters,
  MissingCompatAdaptersError,
  requireAllCompatAdapters,
  type LoadedCompatAdapter,
} from '../adapter-registry'

function fakeLoaded(id: string): LoadedCompatAdapter {
  return { id, pkg: `@barefootjs/${id}`, factory: () => { throw new Error('unused in this test') }, pins: {}, renderDivergences: {} }
}

describe('requireAllCompatAdapters (#2785)', () => {
  test('returns `loaded` unchanged when nothing was skipped', () => {
    const loaded = [fakeLoaded('hono'), fakeLoaded('erb')]
    expect(requireAllCompatAdapters({ loaded, skipped: [] })).toBe(loaded)
  })

  test('throws MissingCompatAdaptersError naming every skipped package, its reason, and a build command', () => {
    const loaded = [fakeLoaded('hono')]
    const skipped = [
      { pkg: '@barefootjs/erb', reason: "Cannot find module '@barefootjs/erb' from '/x'" },
      { pkg: '@barefootjs/twig', reason: "Cannot find module '@barefootjs/twig' from '/x'" },
    ]

    let thrown: unknown
    try {
      requireAllCompatAdapters({ loaded, skipped })
    } catch (err) {
      thrown = err
    }

    expect(thrown).toBeInstanceOf(MissingCompatAdaptersError)
    const err = thrown as MissingCompatAdaptersError
    expect(err.skipped).toBe(skipped)
    expect(err.message).toContain('2 of 3')
    expect(err.message).toContain('@barefootjs/erb')
    expect(err.message).toContain("Cannot find module '@barefootjs/erb' from '/x'")
    expect(err.message).toContain('@barefootjs/twig')
    expect(err.message).toContain("bun run --filter '@barefootjs/erb' --filter '@barefootjs/twig' build")
  })
})

describe('loadAllCompatAdapters (#2785)', () => {
  test('resolves every registered adapter in this monorepo (mirrors compat-pins.test.ts\'s skipped===[] assertion)', async () => {
    const loaded = await loadAllCompatAdapters()
    expect(loaded.length).toBeGreaterThan(0)
  })
})
