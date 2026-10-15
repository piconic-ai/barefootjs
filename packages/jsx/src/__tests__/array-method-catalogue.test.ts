/**
 * The shared array / string method catalogue (#3476): what each method
 * lowers to, independent of any DSL's spelling.
 */

import { describe, test, expect } from 'bun:test'
import {
  ARRAY_METHOD_CATALOGUE,
  emitArrayMethod,
  lowerArrayMethod,
  prefixedArrayMethodSpelling,
} from '../adapters/array-method'
import type { ArrayMethod } from '../adapters/parsed-expr-emitter'
import type { ParsedExpr } from '../expression-parser'

const id = (name: string): ParsedExpr => ({ kind: 'identifier', name })
const recv = id('xs')
const a = id('a')
const b = id('b')
const c = id('c')
const emit = (e: ParsedExpr) => (e.kind === 'identifier' ? e.name : '?')
const spelling = prefixedArrayMethodSpelling('bf.', 'UNDEF')
const lower = (method: ArrayMethod, args: ParsedExpr[]) =>
  emitArrayMethod(lowerArrayMethod(method, recv, args), emit, spelling)

describe('lowerArrayMethod', () => {
  test('fills a defaulted argument the source left out', () => {
    expect(lower('join', [])).toBe("bf.join(xs, ',')")
    expect(lower('at', [])).toBe('bf.at(xs, 0)')
    expect(lower('toFixed', [])).toBe('bf.to_fixed(xs, 0)')
    expect(lower('repeat', [])).toBe('bf.repeat(xs, 0)')
    expect(lower('padStart', [])).toBe('bf.pad_start(xs, 0)')
  })

  test("slice's end defaults to the backend's undefined literal, its start to 0", () => {
    expect(lower('slice', [])).toBe('bf.slice(xs, 0, UNDEF)')
    expect(lower('slice', [a])).toBe('bf.slice(xs, a, UNDEF)')
    expect(lower('slice', [a, b])).toBe('bf.slice(xs, a, b)')
  })

  test('an optional argument the source left out shortens the call', () => {
    expect(lower('split', [])).toBe('bf.split(xs)')
    expect(lower('split', [a])).toBe('bf.split(xs, a)')
    expect(lower('split', [a, b])).toBe('bf.split(xs, a, b)')
    expect(lower('startsWith', [a])).toBe('bf.starts_with(xs, a)')
    expect(lower('endsWith', [a, b])).toBe('bf.ends_with(xs, a, b)')
    expect(lower('padEnd', [a])).toBe('bf.pad_end(xs, a)')
    expect(lower('padEnd', [a, b])).toBe('bf.pad_end(xs, a, b)')
  })

  test('arguments past the catalogued ones are dropped', () => {
    // JS's `fromIndex` is not lowered.
    expect(lower('indexOf', [a, b])).toBe('bf.index_of(xs, a)')
    expect(lower('concat', [a, b])).toBe('bf.concat(xs, a)')
    expect(lower('trim', [a])).toBe('bf.trim(xs)')
    expect(lower('padStart', [a, b, c])).toBe('bf.pad_start(xs, a, b)')
  })

  test('concat with no argument is the receiver itself', () => {
    expect(lowerArrayMethod('concat', recv, [])).toEqual({ kind: 'receiver', object: recv })
    expect(lower('concat', [])).toBe('xs')
  })

  test('a reversed copy and the in-place reverse share one helper', () => {
    expect(lower('reverse', [])).toBe('bf.reverse(xs)')
    expect(lower('toReversed', [])).toBe('bf.reverse(xs)')
  })

  test('a missing required argument throws (the parser refuses such a call)', () => {
    expect(() => lowerArrayMethod('replace', recv, [a])).toThrow("'.replace()' needs argument 2")
  })

  test('emits the receiver first, then the arguments in order', () => {
    const order: string[] = []
    const recording = (e: ParsedExpr) => (order.push(emit(e)), emit(e))
    emitArrayMethod(lowerArrayMethod('padStart', recv, [a, b]), recording, spelling)
    expect(order).toEqual(['xs', 'a', 'b'])
  })
})

describe('ARRAY_METHOD_CATALOGUE', () => {
  test('string defaults need no escaping in any DSL', () => {
    for (const entry of Object.values(ARRAY_METHOD_CATALOGUE)) {
      for (const param of entry.params) {
        if (param.kind === 'default' && param.value.kind === 'string') {
          expect(param.value.value).not.toMatch(/['\\]/)
        }
      }
    }
  })

  test('a required argument never follows an optional one', () => {
    for (const [method, entry] of Object.entries(ARRAY_METHOD_CATALOGUE)) {
      const kinds = entry.params.map((p) => p.kind)
      const firstOptional = kinds.indexOf('optional')
      if (firstOptional !== -1) expect({ method, rest: kinds.slice(firstOptional) }).toEqual({ method, rest: kinds.slice(firstOptional).map(() => 'optional') })
    }
  })
})
