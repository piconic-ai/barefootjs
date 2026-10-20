import { describe, test, expect } from 'bun:test'
import { parseExpression } from '../expression-parser'
import { arithmeticHelper, groupBinaryOperand, groupUnaryOperand } from '../adapters/parsed-expr-emitter'

describe('arithmeticHelper (#3474)', () => {
  test('`%` lowers to the runtime\'s JS remainder', () => {
    expect(arithmeticHelper('%')).toBe('mod')
  })

  test('the other operators are spelled by the adapter', () => {
    for (const op of ['+', '-', '*', '/', '**', '===', '<']) expect(arithmeticHelper(op)).toBeNull()
  })
})

describe('groupUnaryOperand (#3474)', () => {
  const group = (src: string) => {
    const parsed = parseExpression(src)
    if (parsed.kind !== 'unary') throw new Error(`not a unary: ${src}`)
    return groupUnaryOperand(parsed.argument, 'X')
  }

  test('a compound operand is grouped, as under a binary operator', () => {
    expect(group('-(a + b)')).toBe('(X)')
    expect(group('-(a || b)')).toBe('(X)')
    expect(group('-(a ? b : c)')).toBe('(X)')
  })

  test('a nested unary operand is grouped, so `--x` never forms', () => {
    expect(group('-(-a)')).toBe('(X)')
  })

  test('a leaf operand stays as it is', () => {
    expect(group('-a')).toBe('X')
    expect(group('-a.b')).toBe('X')
    expect(group('-f()')).toBe('X')
  })

  test('agrees with groupBinaryOperand on everything but a unary operand', () => {
    for (const src of ['a + b', 'a && b', 'a ? b : c', 'a', 'a.b', 'f()', '1']) {
      const parsed = parseExpression(src)
      expect(groupUnaryOperand(parsed, 'X')).toBe(groupBinaryOperand(parsed, 'X'))
    }
  })
})
