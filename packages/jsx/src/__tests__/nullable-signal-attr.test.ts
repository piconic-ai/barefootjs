import { describe, test, expect } from 'bun:test'
import { analyzeComponent } from '../analyzer'
import { parseExpression } from '../expression-parser'
import {
  arithmeticOperandCoercion,
  attrValueMayBeNullish,
  collectAbsentPropSeedReads,
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

function componentIR(params: string, decls: string): ComponentIR {
  const source = `
    'use client'
    import { createSignal } from '@barefootjs/client'
    export function C(${params}) {
      ${decls}
      return <p>x</p>
    }
  `
  return { metadata: analyzeComponent(source, 'C.tsx') } as unknown as ComponentIR
}

describe('signals seeded from an absent optional prop (#3567)', () => {
  test('a bare read, a ternary branch and a `??` right operand are nullable', () => {
    const ir = componentIR('props: { a?: string; b?: string; c?: string }', `
      const [bare] = createSignal(props.a)
      const [branch] = createSignal(props.a === 'x' ? props.b : 'y')
      const [fallback] = createSignal(props.a ?? props.c)
    `)
    expect([...collectNullableSignalGetters(ir)].sort()).toEqual(['bare', 'branch', 'fallback'])
    expect(collectAbsentPropSeedReads(ir).get('branch')).toEqual(new Set(['b']))
    expect(collectAbsentPropSeedReads(ir).get('fallback')).toEqual(new Set(['c']))
  })

  test('destructured params are read by their binding name', () => {
    const ir = componentIR('{ label }: { label?: string }', 'const [shown] = createSignal(label)')
    expect([...collectNullableSignalGetters(ir)]).toEqual(['shown'])
  })

  test('a required prop, a defaulted prop, a `??` left operand or a value built from the prop is not', () => {
    const ir = componentIR("{ req, def = 'd', opt }: { req: string; def?: string; opt?: string }", `
      const [a] = createSignal(req)
      const [b] = createSignal(def)
      const [c] = createSignal(opt ?? 'x')
      const [d] = createSignal(opt === 'x')
      const [e] = createSignal(\`\${opt}\`)
    `)
    expect([...collectNullableSignalGetters(ir)]).toEqual([])
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

describe('arithmeticOperandCoercion (#3474)', () => {
  function ctxOf(signature: string, decls = ''): ReturnType<typeof collectNullishAttrContext> {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function C(${signature}) {
        ${decls}
        return <p>x</p>
      }
    `
    const metadata = analyzeComponent(source, 'C.tsx')
    return collectNullishAttrContext({ metadata } as unknown as ComponentIR)
  }
  const coercion = (ctx: ReturnType<typeof collectNullishAttrContext>, op: string, operand: string, other: string) =>
    arithmeticOperandCoercion(op, parseExpression(operand), parseExpression(other), ctx)

  test('a nullable number prop reads as null under every arithmetic operator, + with a number included', () => {
    const ctx = ctxOf('props: { a: number | null; b?: number; c: number; d: string | null }')
    for (const op of ['-', '*', '/', '%', '**']) expect(coercion(ctx, op, 'props.a', 'x')).toBe('null')
    expect(coercion(ctx, '+', 'props.a', '1')).toBe('null')
    expect(coercion(ctx, '+', 'props.b', '-2')).toBe('null')
    expect(coercion(ctx, '*', 'props.c', '2')).toBeNull()
    expect(coercion(ctx, '*', 'props.d', '2')).toBeNull()
  })

  test('+ is left alone unless the other operand is a number: it may concatenate', () => {
    const ctx = ctxOf('props: { a: number | null }', 'const [n] = createSignal<number | null>(null)')
    expect(coercion(ctx, '+', 'props.a', 'label')).toBeNull()
    expect(coercion(ctx, '+', "props.a", "'px'")).toBeNull()
    expect(coercion(ctx, '+', 'n()', '1')).toBe('null')
  })

  test('a destructured nullable number prop, and a shadowed one', () => {
    const ctx = ctxOf('{ a }: { a?: number }')
    expect(coercion(ctx, '*', 'a', '2')).toBe('null')
    expect(arithmeticOperandCoercion('*', parseExpression('a'), parseExpression('2'), ctx, n => n === 'a')).toBeNull()
  })

  test('a defaulted prop is not nullable; an undefined-seeded signal keeps its NaN coercion', () => {
    expect(coercion(ctxOf('{ a = 1 }: { a?: number }'), '*', 'a', '2')).toBeNull()
    expect(coercion(ctxOf('', 'const [t] = createSignal<number>()'), '+', 't()', '1')).toBe('undefined')
  })
})
