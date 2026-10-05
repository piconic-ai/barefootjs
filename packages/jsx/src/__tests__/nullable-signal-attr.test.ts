import { describe, test, expect } from 'bun:test'
import { analyzeComponent } from '../analyzer'
import { parseExpression } from '../expression-parser'
import {
  attrValueMayBeNullish,
  collectNullableSignalGetters,
  collectNullishAttrContext,
  nullableSignalAttrGetter,
} from '../nullable-signal-attr'
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

describe('attrValueMayBeNullish (#3322)', () => {
  const source = `
    'use client'
    import { createMemo, createSignal } from '@barefootjs/client'
    export function C() {
      const [s] = createSignal<string | undefined>(undefined)
      const [t] = createSignal('x')
      const [user] = createSignal<{ name?: string }>({})
      const label = createMemo(() => s())
      const nested = createMemo(() => label())
      const plain = createMemo(() => t())
      const typed = createMemo<string | undefined>(() => t())
      const loop = createMemo(() => loop())
      return <p>x</p>
    }
  `
  const ctx = collectNullishAttrContext({ metadata: analyzeComponent(source, 'C.tsx') } as unknown as ComponentIR)
  const mayBe = (expr: string, shadowed: string[] = []) =>
    attrValueMayBeNullish(parseExpression(expr), ctx, name => shadowed.includes(name))

  test('a nullable signal or a memo over one, however deep', () => {
    for (const expr of ['s()', 'label()', 'nested()', 'typed()']) expect(mayBe(expr)).toBe(true)
  })

  test('a memo over a present value, or a self-referencing memo, is not', () => {
    for (const expr of ['t()', 'plain()', 'loop()']) expect(mayBe(expr)).toBe(false)
  })

  test('an optional member read, or a member of a nullable value', () => {
    expect(mayBe('user()?.name')).toBe(true)
    expect(mayBe('label().length')).toBe(true)
    expect(mayBe('user().name')).toBe(false)
  })

  test('a ternary or logical operand the result can be', () => {
    expect(mayBe("t() ? s() : 'a'")).toBe(true)
    expect(mayBe("t() ? 'a' : label()")).toBe(true)
    expect(mayBe("s() ? 'a' : 'b'")).toBe(false)
    expect(mayBe("s() ?? 'a'")).toBe(false)
    expect(mayBe("t() || s()")).toBe(true)
    expect(mayBe("s() && 'a'")).toBe(true)
  })

  test('literal undefined / null, and nothing else', () => {
    expect(mayBe('undefined')).toBe(true)
    expect(mayBe('null')).toBe(true)
    expect(mayBe("''")).toBe(false)
    expect(mayBe('0')).toBe(false)
  })

  test('a getter a loop binding shadows is not the signal or memo', () => {
    expect(mayBe('label()', ['label'])).toBe(false)
  })

  test("a memo's body reads its getters where the memo is declared, not where it is read", () => {
    expect(mayBe('label()', ['s'])).toBe(true)
    expect(mayBe('nested()', ['s', 'label'])).toBe(true)
  })
})
