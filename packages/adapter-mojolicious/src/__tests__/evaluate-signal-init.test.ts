import { describe, test, expect } from 'bun:test'
import { evaluateSignalInit } from '../test-render'

describe('evaluateSignalInit — SSR signal seeding (#1672)', () => {
  test('parses an inline object-array initial value', () => {
    // The whole-item loop-conditional fixture seeds `items` from an inline
    // object array. Without array support this returned null, so `$items` was
    // undefined in the Mojo SSR render and the loop rendered empty.
    expect(evaluateSignalInit(`[{ id: 'a' }, { id: 'b' }, { id: 'c' }]`)).toEqual([
      { id: 'a' },
      { id: 'b' },
      { id: 'c' },
    ])
  })

  test('parses scalar and mixed arrays, including nested objects', () => {
    expect(evaluateSignalInit(`['x', 'y']`)).toEqual(['x', 'y'])
    expect(evaluateSignalInit(`[1, 2, 3]`)).toEqual([1, 2, 3])
    expect(evaluateSignalInit(`[{ id: 'a', n: 1, ok: true }]`)).toEqual([
      { id: 'a', n: 1, ok: true },
    ])
  })

  test('still parses scalars, empty array, and props passthrough', () => {
    expect(evaluateSignalInit(`'b'`)).toBe('b')
    expect(evaluateSignalInit(`5`)).toBe(5)
    expect(evaluateSignalInit(`[]`)).toEqual([])
    expect(evaluateSignalInit(`props.value`, { value: 42 })).toBe(42)
  })

  test('bails to null for arrays with non-literal elements', () => {
    // A call / identifier element can't be evaluated at seed time.
    expect(evaluateSignalInit(`[foo(), bar]`)).toBeNull()
  })
})
