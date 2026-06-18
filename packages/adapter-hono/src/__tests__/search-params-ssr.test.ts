/**
 * searchFromRequestUrl — the pure query-extraction helper the Hono SSR
 * auto-wire publishes through the keyed `globalThis.__bf_serverEnvReader` seam
 * (which `@barefootjs/client`'s `searchParams()` reads on the server, key
 * `'search'`), spec/router.md v0.5.
 */

import { describe, test, expect } from 'bun:test'
import { searchFromRequestUrl } from '../search-params-ssr'

describe('searchFromRequestUrl', () => {
  test('returns the query string including the leading "?"', () => {
    expect(searchFromRequestUrl('https://example.test/list?sort=price&page=2')).toBe('?sort=price&page=2')
  })

  test('returns empty string for a query-less URL', () => {
    expect(searchFromRequestUrl('https://example.test/list')).toBe('')
  })

  test('never throws on a malformed URL', () => {
    expect(searchFromRequestUrl('not a url')).toBe('')
  })
})
