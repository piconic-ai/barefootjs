import { describe, test, expect } from 'bun:test'
import { analyzeComponent } from '../analyzer'
import { parseExpression } from '../expression-parser'
import { collectNullableSignalGetters, nullableSignalAttrGetter } from '../nullable-signal-attr'
import type { ComponentIR } from '../types'

function nullableGetters(decls: string): Set<string> {
  const source = `
    'use client'
    import { createSignal } from '@barefootjs/client'
    export function C() {
      ${decls}
      return <p>x</p>
    }
  `
  const metadata = analyzeComponent(source, 'C.tsx')
  return collectNullableSignalGetters({ metadata } as unknown as ComponentIR)
}

describe('collectNullableSignalGetters (#3304)', () => {
  test('a zero-arg typed signal is nullable', () => {
    expect([...nullableGetters('const [a] = createSignal<number>()')]).toEqual(['a'])
  })

  test('a type admitting undefined or null is nullable, whatever the initial value', () => {
    expect([...nullableGetters(`
      const [a] = createSignal<string | undefined>(undefined)
      const [b] = createSignal<string | null>('x')
    `)].sort()).toEqual(['a', 'b'])
  })

  test('an untyped literal undefined or null initial value is nullable', () => {
    expect([...nullableGetters(`
      const [a] = createSignal(undefined)
      const [b] = createSignal(null)
    `)].sort()).toEqual(['a', 'b'])
  })

  test('a non-nullable typed or inferred signal is not', () => {
    expect([...nullableGetters(`
      const [a] = createSignal('x')
      const [b] = createSignal<number>(0)
    `)]).toEqual([])
  })
})

describe('nullableSignalAttrGetter (#3304)', () => {
  const nullable = new Set(['s'])

  test('matches a bare zero-arg read of a nullable signal', () => {
    expect(nullableSignalAttrGetter(parseExpression('s()'), nullable)).toBe('s')
  })

  test('does not match any other shape', () => {
    for (const expr of ['t()', 's', 's(1)', 's()?.x', "s() ?? 'a'", 'a ? s() : b']) {
      expect(nullableSignalAttrGetter(parseExpression(expr), nullable)).toBeNull()
    }
  })
})
