/**
 * `queryHref` — the pure URL-query builder (#2042). Pins the truthy-omit
 * inclusion rule and the `URLSearchParams` encoding the SSR adapters must match.
 */

import { describe, test, expect } from 'bun:test'
import { queryHref } from '../src/query-href'

describe('queryHref', () => {
  test('returns the bare base when no params survive', () => {
    expect(queryHref('/list', {})).toBe('/list')
    expect(queryHref('/list', { sort: undefined, tag: '' })).toBe('/list')
  })

  test('includes only truthy values, in insertion order', () => {
    expect(queryHref('/list', { sort: 'name', tag: 'go' })).toBe('/list?sort=name&tag=go')
  })

  test('omits empty / undefined / null values', () => {
    expect(
      queryHref('/list', { a: 'x', b: undefined, c: null, d: '', g: 'y' }),
    ).toBe('/list?a=x&g=y')
  })

  test('folds a conditional include into the value', () => {
    const build = (sort: string, tag: string) =>
      queryHref('/list', { sort: sort !== 'date' ? sort : undefined, tag })
    expect(build('name', 'go')).toBe('/list?sort=name&tag=go')
    expect(build('date', 'go')).toBe('/list?tag=go') // sort omitted
    expect(build('date', '')).toBe('/list') // both omitted → bare base
  })

  test('a conditional whose consequent is empty is still omitted (matches the SSR guard)', () => {
    // `cond ? '' : undefined` → `if ('')` → omitted, even though `cond` holds.
    // The SSR lowering mirrors this by passing `(cond)` as the include flag and
    // letting the query helper omit the empty value (the same non-empty check it
    // applies to a plain `key: v`).
    const build = (sort: string) => queryHref('/list', { sort: sort !== 'date' ? sort : undefined })
    expect(build('')).toBe('/list') // sort='' is !== 'date' (cond true) but value empty → omit
  })

  test('an array value appends one entry per non-empty member (URLSearchParams.append)', () => {
    expect(queryHref('/list', { tag: ['a', 'b'] })).toBe('/list?tag=a&tag=b')
    // Interleaves with scalar params in insertion order.
    expect(queryHref('/list', { sort: 'name', tag: ['a', 'b'] })).toBe('/list?sort=name&tag=a&tag=b')
  })

  test('empty array members are skipped (truthy-omit); an all-empty array contributes nothing', () => {
    expect(queryHref('/list', { tag: ['a', '', 'b'] })).toBe('/list?tag=a&tag=b')
    expect(queryHref('/list', { tag: [] })).toBe('/list')
    expect(queryHref('/list', { tag: ['', ''] })).toBe('/list')
    // An array reduced to nothing leaves only the surviving scalar.
    expect(queryHref('/list', { sort: 'name', tag: [] })).toBe('/list?sort=name')
  })

  test('array members are form-encoded like scalars', () => {
    expect(queryHref('/s', { tag: ['a b', 'c~d*'] })).toBe('/s?tag=a+b&tag=c%7Ed*')
  })

  test('form-encodes keys and values like URLSearchParams (space → +)', () => {
    expect(queryHref('/s', { q: 'a b', 'x y': 'c&d' })).toBe('/s?q=a+b&x+y=c%26d')
  })

  test('a repeated key would overwrite — but object literals have unique keys', () => {
    // The object form can't express duplicate keys; this just documents that the
    // result is a single pair (parity with bf_query set()-overwrite semantics).
    expect(queryHref('/p', { k: 'v' })).toBe('/p?k=v')
  })
})
