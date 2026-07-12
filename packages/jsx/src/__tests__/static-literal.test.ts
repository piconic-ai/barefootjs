import { describe, test, expect } from 'bun:test'
import { parseExpression } from '../expression-parser'
import { evaluateStaticLiteral, isFullyStaticLiteral, resolveStaticLoopSource } from '../static-literal'
import type { ConstantInfo } from '../types'

// #2208: a function-scope local const whose initializer is fully known at
// compile time (no prop/signal/function-call dependency) should bind as a
// loop source the same way a module-scope const already does.
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

  test('a MODULE-scope const is excluded (handled by the existing seeding path instead)', () => {
    const locals = [constant({ name: 'items', parsed: parseExpression("[{ label: 'Alpha' }]"), isModule: true })]
    expect(resolveStaticLoopSource(parseExpression('items'), locals)).toBeNull()
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
