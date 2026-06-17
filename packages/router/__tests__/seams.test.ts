/**
 * `regionHasIslands` is the decision behind dispose/rehydrate failure
 * surfacing: a region with hydration markers (`bf-s` / `bf-h`) that can't reach
 * the client runtime is a real failure to report (spec/router.md "Neither may
 * silently no-op"), whereas a static shell genuinely has nothing to do.
 */

import { describe, test, expect, beforeAll } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

beforeAll(() => {
  if (typeof window === 'undefined') {
    GlobalRegistrator.register({ url: 'https://example.test/' })
  }
})

const { regionHasIslands } = await import('../src/seams.ts')

function regionFrom(html: string): Element {
  const el = document.createElement('div')
  el.innerHTML = html
  return el
}

describe('regionHasIslands', () => {
  test('true for a region containing a bf-s scope root', () => {
    expect(regionHasIslands(regionFrom('<div bf-s="x">island</div>'))).toBe(true)
  })

  test('true for a region containing a bf-h child-scope host', () => {
    expect(regionHasIslands(regionFrom('<p>text</p><span bf-h="c">child</span>'))).toBe(true)
  })

  test('true when the region element itself is a scope root', () => {
    const el = regionFrom('<p>content</p>')
    el.setAttribute('bf-s', 'self')
    expect(regionHasIslands(el)).toBe(true)
  })

  test('false for a static region with no hydration markers', () => {
    expect(regionHasIslands(regionFrom('<h1>Title</h1><p>just static content</p>'))).toBe(false)
  })
})
