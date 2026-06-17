/**
 * searchParams() — request-scoped reactive environment signal (spec/router.md
 * "The wedge", v0.5).
 *
 * Verifies: client reads the live URL query; the router push seam
 * (`window.__bf_pushSearch`) updates it reactively and idempotently; and the
 * SSR path resolves per-request through an injected reader with no cached
 * module-level signal (race-free).
 */

import { describe, test, expect, beforeAll } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

beforeAll(() => {
  if (typeof window === 'undefined') {
    GlobalRegistrator.register({ url: 'https://example.test/list?sort=price' })
  }
})

const { searchParams, __bfSetServerSearchReader, createEffect, createRoot } = await import(
  '../src/reactive.ts'
)

describe('searchParams (client)', () => {
  test('reads the live URL query on first access and installs the push seam', () => {
    expect(searchParams().get('sort')).toBe('price')
    // First read lazily installs the router-facing seam.
    expect(typeof (window as unknown as { __bf_pushSearch?: unknown }).__bf_pushSearch).toBe('function')
  })

  test('the push seam updates the signal reactively', () => {
    const seen: (string | null)[] = []
    let dispose = () => {}
    createRoot((d) => {
      dispose = d
      createEffect(() => {
        seen.push(searchParams().get('sort'))
      })
    })
    const initial = seen.length
    ;(window as unknown as { __bf_pushSearch: (s: string) => void }).__bf_pushSearch('?sort=name')
    expect(seen[seen.length - 1]).toBe('name')
    expect(seen.length).toBe(initial + 1)
    dispose()
  })

  test('pushing the same query is idempotent (no re-run)', () => {
    let runs = 0
    let dispose = () => {}
    createRoot((d) => {
      dispose = d
      createEffect(() => {
        searchParams()
        runs++
      })
    })
    const push = (window as unknown as { __bf_pushSearch: (s: string) => void }).__bf_pushSearch
    const before = runs
    const current = `?${searchParams().toString()}`
    push(current) // same value
    expect(runs).toBe(before)
    dispose()
  })
})

describe('searchParams (SSR)', () => {
  test('resolves per-request through the injected reader, never caching', () => {
    const savedWindow = (globalThis as unknown as { window?: unknown }).window
    // Force the SSR branch (`typeof window === 'undefined'`).
    delete (globalThis as unknown as { window?: unknown }).window
    try {
      let current = '?q=alpha'
      __bfSetServerSearchReader(() => current)
      expect(searchParams().get('q')).toBe('alpha')
      // A second request's value — no module-level signal cached the first.
      current = '?q=beta'
      expect(searchParams().get('q')).toBe('beta')
      // No reader → empty query, never throws.
      __bfSetServerSearchReader(null)
      expect(searchParams().toString()).toBe('')
    } finally {
      ;(globalThis as unknown as { window?: unknown }).window = savedWindow
    }
  })

  test('falls back to the globalThis reader seam (adapter wiring without importing the client)', () => {
    const savedWindow = (globalThis as unknown as { window?: unknown }).window
    delete (globalThis as unknown as { window?: unknown }).window
    const g = globalThis as unknown as { __bf_serverSearchReader?: () => string }
    try {
      __bfSetServerSearchReader(null) // explicit setter unused — seam should win
      g.__bf_serverSearchReader = () => '?via=seam'
      expect(searchParams().get('via')).toBe('seam')
    } finally {
      delete g.__bf_serverSearchReader
      ;(globalThis as unknown as { window?: unknown }).window = savedWindow
    }
  })
})
