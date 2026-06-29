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

  test('omits falsy values (undefined / null / empty / 0 / false)', () => {
    expect(
      queryHref('/list', { a: 'x', b: undefined, c: null, d: '', e: 0, f: false, g: 'y' }),
    ).toBe('/list?a=x&g=y')
  })

  test('folds a conditional include into the value', () => {
    const build = (sort: string, tag: string) =>
      queryHref('/list', { sort: sort !== 'date' ? sort : undefined, tag })
    expect(build('name', 'go')).toBe('/list?sort=name&tag=go')
    expect(build('date', 'go')).toBe('/list?tag=go') // sort omitted
    expect(build('date', '')).toBe('/list') // both omitted → bare base
  })

  test('stringifies number / boolean values', () => {
    expect(queryHref('/p', { page: 2, active: true })).toBe('/p?page=2&active=true')
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
