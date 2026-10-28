import { describe, test, expect } from 'bun:test'
import { analyzeComponent } from '../analyzer'
import { exprToString, parseExpression } from '../expression-parser'
import {
  ambiguousNilArithmeticOperands,
  arithmeticOperandCoercion,
  arithmeticOperandIsNull,
  arithmeticOperandIsUndefined,
  arithmeticOperandNilIsAmbiguous,
  attrValueMayBeNullish,
  collectAbsentPropSeedReads,
  collectNullableSignalGetters,
  collectNullishAttrContext,
  nullableSignalAttrGetter,
} from '../nullable-signal-attr'
import { BindingScope } from '../scope/binding-scope'
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
      const tail = createMemo(() => t().at(-1))
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

  test('`.at(i)` / `.find()` / `.findLast()` read undefined, directly or through a memo', () => {
    expect(mayBe('t().at(-1)')).toBe(true)
    expect(mayBe('tail()')).toBe(true)
    expect(mayBe("t() ? t().at(9) : 'x'")).toBe(true)
    expect(mayBe("t().at(-1) ?? 'x'")).toBe(false)
    expect(mayBe('t().slice(-1)')).toBe(false)
    expect(mayBe("t().indexOf('a')")).toBe(false)
    expect(mayBe("xs.find(x => x === 'z')")).toBe(true)
    expect(mayBe('xs.findLast(x => x)')).toBe(true)
    expect(mayBe("xs.find(x => x === 'z').name")).toBe(true)
    expect(mayBe('xs.findIndex(x => x)')).toBe(false)
    expect(mayBe('xs.filter(x => x)')).toBe(false)
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
    const ctx = ctxOf('props: { a: number | null; c: number; d: string | null }')
    for (const op of ['-', '*', '/', '%', '**']) expect(coercion(ctx, op, 'props.a', 'x')).toBe('null')
    expect(coercion(ctx, '+', 'props.a', '1')).toBe('null')
    expect(coercion(ctx, '*', 'props.c', '2')).toBeNull()
    expect(coercion(ctx, '*', 'props.d', '2')).toBeNull()
  })

  test('a number prop that can only be absent reads its nil as undefined (#3533)', () => {
    const ctx = ctxOf('props: { b?: number; u: number | undefined; both?: number | null }')
    for (const op of ['-', '*', '/', '%', '**']) expect(coercion(ctx, op, 'props.b', 'x')).toBe('undefined')
    expect(coercion(ctx, '+', 'props.b', '-2')).toBe('undefined')
    expect(coercion(ctx, '*', 'props.u', '2')).toBe('undefined')
    // A type that admits both keeps the null spelling; the arithmetic over it
    // is refused (`arithmeticOperandNilIsAmbiguous`, #3700).
    expect(coercion(ctx, '*', 'props.both', '2')).toBe('null')
  })

  test('unary minus passes no other operand and coerces like binary minus (#3533)', () => {
    const ctx = ctxOf('props: { a: number | null; b?: number; c: number }')
    const unary = (operand: string) => arithmeticOperandCoercion('-', parseExpression(operand), undefined, ctx)
    expect(unary('props.a')).toBe('null')
    expect(unary('props.b')).toBe('undefined')
    expect(unary('props.c')).toBeNull()
  })

  test('an absent-only prop is not certainly undefined: arithmeticOperandIsUndefined stays false', () => {
    const ctx = ctxOf('props: { b?: number }')
    expect(arithmeticOperandIsUndefined(parseExpression('props.b'), ctx)).toBe(false)
  })

  test('+ is left alone unless the other operand is a number: it may concatenate', () => {
    const ctx = ctxOf('props: { a: number | null }', 'const [n] = createSignal<number | null>(null)')
    expect(coercion(ctx, '+', 'props.a', 'label')).toBeNull()
    expect(coercion(ctx, '+', "props.a", "'px'")).toBeNull()
    expect(coercion(ctx, '+', 'n()', '1')).toBe('null')
  })

  test('a destructured nullable number prop, and a shadowed one', () => {
    const ctx = ctxOf('{ a }: { a?: number }')
    expect(coercion(ctx, '*', 'a', '2')).toBe('undefined')
    expect(arithmeticOperandCoercion('*', parseExpression('a'), parseExpression('2'), ctx, n => n === 'a')).toBeNull()
  })

  test('a defaulted prop is not nullable; an undefined-seeded signal keeps its NaN coercion', () => {
    expect(coercion(ctxOf('{ a = 1 }: { a?: number }'), '*', 'a', '2')).toBeNull()
    expect(coercion(ctxOf('', 'const [t] = createSignal<number>()'), '+', 't()', '1')).toBe('undefined')
  })
})

describe('arithmeticOperandNilIsAmbiguous (#3700)', () => {
  function ctxOf(signature: string, decls = ''): ReturnType<typeof collectNullishAttrContext> {
    const source = `
      'use client'
      import { createMemo } from '@barefootjs/client'
      export function C(${signature}) {
        ${decls}
        return <p>x</p>
      }
    `
    return collectNullishAttrContext({ metadata: analyzeComponent(source, 'C.tsx') } as unknown as ComponentIR)
  }
  const ambiguous = (ctx: ReturnType<typeof collectNullishAttrContext>, op: string, operand: string, other?: string) =>
    arithmeticOperandNilIsAmbiguous(op, parseExpression(operand), other === undefined ? undefined : parseExpression(other), ctx)

  test('a number prop that admits both null and absence, in either props form', () => {
    for (const signature of ['props: { n?: number | null }', 'props: { n: number | null | undefined }']) {
      const ctx = ctxOf(signature)
      for (const op of ['-', '*', '/', '%', '**']) expect(ambiguous(ctx, op, 'props.n', 'x')).toBe(true)
      expect(ambiguous(ctx, '+', 'props.n', '1')).toBe(true)
      expect(ambiguous(ctx, '-', 'props.n')).toBe(true)
      // `+` against a non-number may concatenate: no `ToNumber`, no ambiguity.
      expect(ambiguous(ctx, '+', 'props.n', "'px'")).toBe(false)
    }
    const destructured = ctxOf('{ n, m: alias }: { n?: number | null; m?: null | number }')
    expect(ambiguous(destructured, '*', 'n', '2')).toBe(true)
    expect(ambiguous(destructured, '*', 'alias', '2')).toBe(true)
  })

  test('a prop with one nil reading, a defaulted one and a shadowed one are not ambiguous', () => {
    const ctx = ctxOf('props: { a: number | null; b?: number; c: number }')
    for (const operand of ['props.a', 'props.b', 'props.c']) expect(ambiguous(ctx, '*', operand, '2')).toBe(false)
    expect(ambiguous(ctxOf('{ n = 1 }: { n?: number | null }'), '*', 'n', '2')).toBe(false)
    const destructured = ctxOf('{ n }: { n?: number | null }')
    expect(arithmeticOperandNilIsAmbiguous('*', parseExpression('n'), parseExpression('2'), destructured, name => name === 'n')).toBe(false)
  })

  test('an identity memo over the prop is ambiguous too; the null spelling is kept for it', () => {
    const ctx = ctxOf('props: { n?: number | null }', 'const m = createMemo(() => props.n)')
    expect(ambiguous(ctx, '*', 'm()', '2')).toBe(true)
    expect(arithmeticOperandCoercion('*', parseExpression('m()'), parseExpression('2'), ctx)).toBe('null')
    expect(arithmeticOperandIsNull(parseExpression('m()'), ctx)).toBe(true)
  })

  test('a destructured union binding keeps its declared type for the classification', () => {
    const ctx = ctxOf('{ a, u }: { a: number | null; u?: number | undefined }')
    expect(arithmeticOperandCoercion('*', parseExpression('a'), parseExpression('2'), ctx)).toBe('null')
    expect(arithmeticOperandCoercion('*', parseExpression('u'), parseExpression('2'), ctx)).toBe('undefined')
  })
})

describe('ambiguousNilArithmeticOperands (#3700)', () => {
  const ctx = collectNullishAttrContext({
    metadata: analyzeComponent(
      `export function C({ n, items }: { n?: number | null; items: number[] }) { return <p>x</p> }`,
      'C.tsx',
    ),
  } as unknown as ComponentIR)
  const found = (source: string, scope?: BindingScope) =>
    ambiguousNilArithmeticOperands(parseExpression(source), ctx, scope).map(exprToString)

  test('finds the operands in nested positions', () => {
    expect(found("items.filter(i => i > n * 2).length")).toEqual(['n'])
    expect(found("(-n > 1 ? `a${n + 1}` : 'b')")).toEqual(['n', 'n'])
  })

  test('an arrow param or an enclosing binding of the same name shadows the prop', () => {
    expect(found("items.filter(n => n * 2 > 1).length")).toEqual([])
    expect(found("items.map(i => items.filter(n => n > i).length * n)")).toEqual(['n'])
    expect(found('n * 2', BindingScope.EMPTY.enterCallback(['n']))).toEqual([])
    // A sibling arrow's param does not leak out of its own body.
    expect(found('items.filter(n => n > 1).length * n')).toEqual(['n'])
  })
})
