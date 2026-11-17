import { describe, test, expect } from 'bun:test'
import { parseExpression, stringifyParsedExpr } from '../expression-parser'
import { evaluateStaticLiteral, foldStaticBindings, isFullyStaticLiteral, resolveStaticLoopSource } from '../static-literal'
import type { ConstantInfo } from '../types'

// #2208: a local const whose initializer is fully known at compile time (no
// prop/signal/function-call dependency) should bind as a loop source the
// same way an inline array literal does — module-scope and function-scope
// alike (#2946).
describe('evaluateStaticLiteral (#2208)', () => {
  test('scalars', () => {
    expect(evaluateStaticLiteral(parseExpression("'Alpha'"))).toEqual({ value: 'Alpha' })
    expect(evaluateStaticLiteral(parseExpression('42'))).toEqual({ value: 42 })
    expect(evaluateStaticLiteral(parseExpression('true'))).toEqual({ value: true })
    expect(evaluateStaticLiteral(parseExpression('null'))).toEqual({ value: null })
  })

  test('a no-substitution template literal', () => {
    expect(evaluateStaticLiteral(parseExpression('`hello`'))).toEqual({ value: 'hello' })
  })

  test('a template literal whose substitutions are all static', () => {
    expect(evaluateStaticLiteral(parseExpression("`a${1}b${'c'}`"))).toEqual({ value: 'a1bc' })
  })

  test('a template literal with a non-static substitution is not static', () => {
    expect(evaluateStaticLiteral(parseExpression('`a${x}`'))).toBeNull()
  })

  test('nested array and object literals', () => {
    expect(evaluateStaticLiteral(parseExpression("[{ label: 'Alpha' }, { label: 'Beta' }]"))).toEqual({
      value: [{ label: 'Alpha' }, { label: 'Beta' }],
    })
    expect(evaluateStaticLiteral(parseExpression("({ a: [1, 2, { b: 'c' }] })"))).toEqual({
      value: { a: [1, 2, { b: 'c' }] },
    })
  })

  test('unary minus/plus/not over a static operand', () => {
    expect(evaluateStaticLiteral(parseExpression('-5'))).toEqual({ value: -5 })
    expect(evaluateStaticLiteral(parseExpression('+5'))).toEqual({ value: 5 })
    expect(evaluateStaticLiteral(parseExpression('!true'))).toEqual({ value: false })
  })

  test('an empty array literal is static', () => {
    expect(evaluateStaticLiteral(parseExpression('[]'))).toEqual({ value: [] })
  })

  test('object shorthand property is not static without bindings', () => {
    // `{ label }` parses `label`'s value as an `identifier` — only
    // resolvable when a caller supplies bindings for it.
    expect(evaluateStaticLiteral(parseExpression('({ label })'))).toBeNull()
  })

  test('a call expression is not static', () => {
    expect(evaluateStaticLiteral(parseExpression("Object.entries({ a: 1 })"))).toBeNull()
  })

  test('a props member access is not static', () => {
    expect(evaluateStaticLiteral(parseExpression('props.tags'))).toBeNull()
  })

  test('a bare identifier resolves only through bindings', () => {
    const expr = parseExpression('item')
    expect(evaluateStaticLiteral(expr)).toBeNull()
    expect(evaluateStaticLiteral(expr, new Map([['item', 'Alpha']]))).toEqual({ value: 'Alpha' })
  })

  test('a member access resolves against a bound object', () => {
    const expr = parseExpression('item.label')
    expect(evaluateStaticLiteral(expr, new Map([['item', { label: 'Alpha' }]]))).toEqual({ value: 'Alpha' })
  })

  test('isFullyStaticLiteral mirrors evaluateStaticLiteral', () => {
    expect(isFullyStaticLiteral(parseExpression("[{ label: 'Alpha' }]"))).toBe(true)
    expect(isFullyStaticLiteral(parseExpression('props.tags'))).toBe(false)
  })
})

describe('resolveStaticLoopSource (#2208)', () => {
  function constant(overrides: Partial<ConstantInfo>): ConstantInfo {
    return {
      name: 'items',
      declarationKind: 'const',
      type: null,
      loc: { line: 0, column: 0 },
      ...overrides,
    } as ConstantInfo
  }

  test('an inline array-literal loop source resolves directly (no named local needed)', () => {
    const result = resolveStaticLoopSource(parseExpression("[{ label: 'Alpha' }, { label: 'Beta' }]"), [])
    expect(result).toEqual([{ label: 'Alpha' }, { label: 'Beta' }])
  })

  test('a bare identifier resolves against a FUNCTION-scope local const with a static initializer', () => {
    const locals = [constant({ name: 'items', parsed: parseExpression("[{ label: 'Alpha' }]") })]
    expect(resolveStaticLoopSource(parseExpression('items'), locals)).toEqual([{ label: 'Alpha' }])
  })

  test('a MODULE-scope const with a static initializer resolves exactly like a function-scope one (#2946)', () => {
    const locals = [constant({ name: 'items', parsed: parseExpression("[{ label: 'Alpha' }]"), isModule: true })]
    expect(resolveStaticLoopSource(parseExpression('items'), locals)).toEqual([{ label: 'Alpha' }])
  })

  test('a MODULE-scope const whose initializer is runtime-computed still refuses (#2946)', () => {
    const locals = [constant({ name: 'items', parsed: parseExpression('buildItems()'), isModule: true })]
    expect(resolveStaticLoopSource(parseExpression('items'), locals)).toBeNull()
  })

  test('a MODULE-scope const shadowed by an enclosing loop param is excluded via isNameShadowed (#2946)', () => {
    const locals = [constant({ name: 'items', parsed: parseExpression("[{ label: 'Alpha' }]"), isModule: true })]
    const result = resolveStaticLoopSource(parseExpression('items'), locals, {
      isNameShadowed: name => name === 'items',
    })
    expect(result).toBeNull()
  })

  test('a const mutated after its declaration (#2910) refuses regardless of scope', () => {
    const moduleLocals = [
      constant({
        name: 'items',
        parsed: parseExpression("[{ label: 'Alpha' }]"),
        isModule: true,
        mutatedAfterDeclaration: true,
      }),
    ]
    expect(resolveStaticLoopSource(parseExpression('items'), moduleLocals)).toBeNull()

    const functionLocals = [
      constant({
        name: 'items',
        parsed: parseExpression("[{ label: 'Alpha' }]"),
        mutatedAfterDeclaration: true,
      }),
    ]
    expect(resolveStaticLoopSource(parseExpression('items'), functionLocals)).toBeNull()
  })

  test('a runtime-computed local const (#2069) still refuses', () => {
    const locals = [constant({ name: 'entries', parsed: parseExpression('Object.entries(props.tags)') })]
    expect(resolveStaticLoopSource(parseExpression('entries'), locals)).toBeNull()
  })

  test('an identifier not naming any local const refuses', () => {
    expect(resolveStaticLoopSource(parseExpression('items'), [])).toBeNull()
  })

  test('a shadowed name is excluded via isNameShadowed', () => {
    const locals = [constant({ name: 'items', parsed: parseExpression("[{ label: 'Alpha' }]") })]
    const result = resolveStaticLoopSource(parseExpression('items'), locals, {
      isNameShadowed: name => name === 'items',
    })
    expect(result).toBeNull()
  })

  test('a static value that is not an array refuses', () => {
    const locals = [constant({ name: 'obj', parsed: parseExpression("{ a: 1 }") })]
    expect(resolveStaticLoopSource(parseExpression('obj'), locals)).toBeNull()
  })
})

// #3798: the row of a compile-time-unrolled loop folds into an expression
// that otherwise reads the component's own scope.
describe('foldStaticBindings (#3798)', () => {
  const fold = (src: string, bindings: Record<string, unknown>) =>
    foldStaticBindings(parseExpression(src), new Map(Object.entries(bindings)))
  const text = (e: ReturnType<typeof fold>) => (e === null ? null : stringifyParsedExpr(e))

  test('a bound name becomes a literal and the rest of the tree is kept', () => {
    expect(text(fold("q === 'x' ? props.label : '0'", { q: 'x' }))).toBe('"x" === "x" ? props.label : "0"')
  })

  test('a static member chain off an object row folds to its value', () => {
    expect(text(fold('item.on ? props.a : item.id', { item: { on: false, id: 'b' } }))).toBe('false ? props.a : "b"')
  })

  test('a template literal keeps its shape and folds the parts inside it', () => {
    expect(text(fold('`${q}-${props.a}`', { q: 'x' }))).toBe('`${"x"}-${props.a}`')
    expect(fold('`${q}x`', { q: 'x' })?.kind).toBe('template-literal')
  })

  test('a number row keeps its value, including 0 and a fraction', () => {
    expect(text(fold('n === 0 ? props.a : n', { n: 0 }))).toBe('0 === 0 ? props.a : 0')
    expect(text(fold('n > 1 ? 1 : 2', { n: 1.5 }))).toBe('1.5 > 1 ? 1 : 2')
  })

  test('a string that spells the bound name is not a reference', () => {
    expect(text(fold("q === 'q' ? 'q' : props.q", { q: 'q' }))).toBe('"q" === "q" ? "q" : props.q')
  })

  test('an arrow parameter named like a bound name shadows it', () => {
    expect(text(fold('props.xs.some(q => q === 1) && q', { q: 'x' }))).toBe('props.xs.some(q => q === 1) && "x"')
    expect(fold('props.xs.some(q => q === 1)', { q: 'x' })).not.toBeNull()
  })

  test('an object row read other than through a static member chain refuses', () => {
    expect(fold('fn(item)', { item: { a: 1 } })).toBeNull()
    expect(fold('item.missing.deeper', { item: { a: 1 } })).toBeNull()
  })

  test('no bindings returns the expression itself', () => {
    const expr = parseExpression('props.a')
    expect(foldStaticBindings(expr, new Map())).toBe(expr)
  })
})
