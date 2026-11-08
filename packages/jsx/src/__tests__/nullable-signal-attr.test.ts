import { describe, test, expect } from 'bun:test'
import { analyzeComponent } from '../analyzer'
import { parseExpression } from '../expression-parser'
import {
  arithmeticOperandCoercion,
  arithmeticOperandIsNull,
  arithmeticOperandIsUndefined,
  attrValueMayBeNullish,
  collectAbsentPropSeedReads,
  collectNullableSignalGetters,
  collectNullishAttrContext,
  isNeverNullishOperand,
  nullablePropsYieldedBy,
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
    // A type that admits both is left to the runtime's helper, which reads
    // `null` and `UNDEF` apart (spec/js-undefined-value.md).
    expect(coercion(ctx, '*', 'props.both', '2')).toBeNull()
  })

  test('unary minus passes no other operand and coerces like binary minus (#3533)', () => {
    const ctx = ctxOf('props: { a: number | null; b?: number; c: number }')
    const unary = (operand: string) => arithmeticOperandCoercion('-', parseExpression(operand), undefined, ctx)
    expect(unary('props.a')).toBe('null')
    expect(unary('props.b')).toBe('undefined')
    expect(unary('props.c')).toBeNull()
  })

  test('unary plus passes no other operand and coerces like unary minus (#3824 step 3)', () => {
    const ctx = ctxOf('props: { a: number | null; b?: number; c: number }')
    const unary = (operand: string) => arithmeticOperandCoercion('+', parseExpression(operand), undefined, ctx)
    expect(unary('props.a')).toBe('null')
    expect(unary('props.b')).toBe('undefined')
    expect(unary('props.c')).toBeNull()
  })

  test('a string or boolean relational operand that may only be absent reads NaN and keeps a present value (#3824 step 3)', () => {
    const ctx = ctxOf('props: { s?: string; b?: boolean; t: string | null; c: string; u: string | undefined }')
    for (const op of ['<', '<=', '>', '>=']) {
      expect(coercion(ctx, op, 'props.s', '1')).toBe('undefined-keep')
      expect(coercion(ctx, op, 'props.s', "'a'")).toBe('undefined-keep')
      expect(coercion(ctx, op, 'props.b', '1')).toBe('undefined-keep')
      expect(coercion(ctx, op, 'props.u', '1')).toBe('undefined-keep')
      // A `null` reading is the helper's own; a required prop has no nil.
      expect(coercion(ctx, op, 'props.t', '1')).toBeNull()
      expect(coercion(ctx, op, 'props.c', '1')).toBeNull()
    }
    // Arithmetic over a string prop is not a relational: left as it is.
    expect(coercion(ctx, '*', 'props.s', '2')).toBeNull()
    expect(arithmeticOperandCoercion('<', parseExpression('props.s'), parseExpression('1'), ctx, n => n === 'props')).toBeNull()
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

describe("an operand whose nil may be either is left to the runtime's helper", () => {
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
  const coercion = (ctx: ReturnType<typeof collectNullishAttrContext>, op: string, operand: string, other?: string) =>
    arithmeticOperandCoercion(op, parseExpression(operand), other === undefined ? undefined : parseExpression(other), ctx)

  test('a number prop that admits both null and absence, in either props form', () => {
    for (const signature of ['props: { n?: number | null }', 'props: { n: number | null | undefined }']) {
      const ctx = ctxOf(signature)
      for (const op of ['-', '*', '/', '%', '**']) expect(coercion(ctx, op, 'props.n', 'x')).toBeNull()
      expect(coercion(ctx, '+', 'props.n', '1')).toBeNull()
      expect(coercion(ctx, '-', 'props.n')).toBeNull()
      expect(coercion(ctx, '+', 'props.n')).toBeNull()
    }
    const destructured = ctxOf('{ n, m: alias }: { n?: number | null; m?: null | number }')
    expect(coercion(destructured, '*', 'n', '2')).toBeNull()
    expect(coercion(destructured, '*', 'alias', '2')).toBeNull()
  })

  test('a relational operand: only the one nil reading is spelled (#3824 step 3)', () => {
    const ctx = ctxOf('props: { n?: number | null; a: number | null; b?: number }')
    for (const op of ['<', '<=', '>', '>=']) {
      expect(coercion(ctx, op, 'props.n', '1')).toBeNull()
      expect(coercion(ctx, op, 'props.a', '1')).toBeNull()
      expect(coercion(ctx, op, 'props.b', '1')).toBe('undefined')
    }
  })

  test('a string or boolean prop admitting both nils under a comparison (#3824 step 3)', () => {
    const ctx = ctxOf('props: { s?: string | null; b?: boolean | null; t?: string; m: string | null }', 'const id = createMemo(() => props.s)')
    for (const op of ['<', '<=', '>', '>=']) {
      expect(coercion(ctx, op, 'props.s', '1')).toBeNull()
      expect(coercion(ctx, op, 'props.b', '1')).toBeNull()
      expect(coercion(ctx, op, 'id()', '1')).toBeNull()
      expect(coercion(ctx, op, 'props.t', '1')).toBe('undefined-keep')
      expect(coercion(ctx, op, 'props.m', '1')).toBeNull()
    }
  })

  test('a defaulted one and a shadowed one keep their own coercion', () => {
    expect(coercion(ctxOf('{ n = 1 }: { n?: number | null }'), '*', 'n', '2')).toBeNull()
    const destructured = ctxOf('{ n }: { n?: number | null }')
    expect(arithmeticOperandCoercion('*', parseExpression('n'), parseExpression('2'), destructured, name => name === 'n')).toBeNull()
  })

  test('an identity memo over the prop is left to the helper too', () => {
    const ctx = ctxOf('props: { n?: number | null }', 'const m = createMemo(() => props.n)')
    expect(coercion(ctx, '*', 'm()', '2')).toBeNull()
    expect(arithmeticOperandIsNull(parseExpression('m()'), ctx)).toBe(true)
  })

  test('a destructured union binding keeps its declared type for the classification', () => {
    const ctx = ctxOf('{ a, u }: { a: number | null; u?: number | undefined }')
    expect(coercion(ctx, '*', 'a', '2')).toBe('null')
    expect(coercion(ctx, '*', 'u', '2')).toBe('undefined')
  })
})

describe('a prop that can be absent, and an operand that is never nullish', () => {
  function irOf(signature: string): ComponentIR {
    const source = `
      export function C(${signature}) {
        return <p>x</p>
      }
    `
    return { metadata: analyzeComponent(source, 'C.tsx') } as unknown as ComponentIR
  }
  const mayBeNullish = (ir: ComponentIR, src: string, shadowed: (n: string) => boolean = () => false) =>
    attrValueMayBeNullish(parseExpression(src), collectNullishAttrContext(ir), shadowed)

  test('an && / ternary over an absent-able prop may be nullish, in both props forms', () => {
    const object = irOf('props: { on?: boolean; label: string | undefined; n: number; d?: string }')
    expect(mayBeNullish(object, "props.on && 'y'")).toBe(true)
    expect(mayBeNullish(object, "props.n > 0 ? props.label : 'x'")).toBe(true)
    expect(mayBeNullish(object, "props.n && 'y'")).toBe(false)
    expect(mayBeNullish(object, "props.on ?? 'y'")).toBe(false)
    expect(mayBeNullish(object, "props.on && 'y'", n => n === 'props')).toBe(false)
    const destructured = irOf("{ on, d = 'z' }: { on?: boolean; d?: string }")
    expect(mayBeNullish(destructured, "on && 'y'")).toBe(true)
    expect(mayBeNullish(destructured, "on && 'y'", n => n === 'on')).toBe(false)
    expect(mayBeNullish(destructured, "d && 'y'")).toBe(false)
  })

  test('nullablePropsYieldedBy names the props a value can be read whole from', () => {
    const ir = irOf('props: { on?: boolean; label?: string; n?: number }')
    const nullable = collectNullishAttrContext(ir).nullableProps!
    expect([...nullablePropsYieldedBy(parseExpression("props.on && (props.n > 0 ? props.label : 'x')"), nullable)].sort()).toEqual(['label', 'on'])
    expect([...nullablePropsYieldedBy(parseExpression("props.on ?? props.label"), nullable)]).toEqual(['label'])
  })

  test('isNeverNullishOperand: a comparison and a required scalar prop, not an optional or shadowed one', () => {
    const object = irOf("props: { flag: boolean; s: string; n: number; tone: 'a' | 'b'; opt?: boolean; u: string | undefined; list: string[] }").metadata
    const never = (src: string, isBound: (n: string) => boolean = () => false) =>
      isNeverNullishOperand(parseExpression(src)!, object, isBound)
    for (const src of ['props.flag', 'props.s', 'props.n', 'props.tone', 'props.n > 1', '!props.opt']) expect(never(src)).toBe(true)
    for (const src of ['props.opt', 'props.u', 'props.list', 'flag']) expect(never(src)).toBe(false)
    expect(never('props.flag', n => n === 'props')).toBe(false)
    const destructured = irOf('{ flag, opt }: { flag: boolean; opt?: boolean }').metadata
    expect(isNeverNullishOperand(parseExpression('flag')!, destructured, () => false)).toBe(true)
    expect(isNeverNullishOperand(parseExpression('flag')!, destructured, n => n === 'flag')).toBe(false)
    expect(isNeverNullishOperand(parseExpression('opt')!, destructured, () => false)).toBe(false)
  })
})
