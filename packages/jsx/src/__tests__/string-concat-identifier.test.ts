import { describe, test, expect } from 'bun:test'
import { isStringTypedOperand, isStringConcatBinary } from '../adapters/parsed-expr-emitter'
import { parseExpression } from '../expression-parser'

// #2212: `isStringTypedOperand` gained a bare-`identifier` arm — previously
// `a + b` where BOTH operands are plain identifiers (destructured props,
// same-file consts) fell through every existing arm (literal, template
// literal, zero-arg getter, `props.x` member) and was treated as numeric
// `+`, even when both operands are string-typed. Twig/Blade/Mojolicious/
// Xslate route a detected string-concat through their own concat operator
// instead of native `+` (numeric-only on all four); this pins the shared
// detection function itself, independent of any one adapter's emitter.
describe('isStringTypedOperand identifier arm (#2212)', () => {
  const isStr = (n: string) => n === 'first' || n === 'last'

  test('a bare identifier known to be string-typed is detected', () => {
    const expr = parseExpression('first')
    expect(isStringTypedOperand(expr, isStr)).toBe(true)
  })

  test('a bare identifier NOT in the known-string set is not detected', () => {
    const expr = parseExpression('count')
    expect(isStringTypedOperand(expr, isStr)).toBe(false)
  })

  test('isStringConcatBinary(+) is true when only ONE identifier operand is string-typed', () => {
    const parsed = parseExpression('first + count')
    if (parsed.kind !== 'binary') throw new Error('expected binary')
    expect(isStringConcatBinary(parsed.op, parsed.left, parsed.right, isStr)).toBe(true)
  })

  test('isStringConcatBinary(+) is false when NEITHER identifier operand is known string-typed', () => {
    const parsed = parseExpression('count + total')
    if (parsed.kind !== 'binary') throw new Error('expected binary')
    expect(isStringConcatBinary(parsed.op, parsed.left, parsed.right, isStr)).toBe(false)
  })

  test('two bare-identifier string operands: first + last', () => {
    const parsed = parseExpression('first + last')
    if (parsed.kind !== 'binary') throw new Error('expected binary')
    expect(isStringConcatBinary(parsed.op, parsed.left, parsed.right, isStr)).toBe(true)
  })

  test('a nested + chain of bare identifiers still resolves via the existing binary-recursion arm', () => {
    const parsed = parseExpression('first + count + last')
    if (parsed.kind !== 'binary') throw new Error('expected binary')
    expect(isStringConcatBinary(parsed.op, parsed.left, parsed.right, isStr)).toBe(true)
  })

  test('a non-+ binary op is never treated as string concat regardless of operand names', () => {
    const parsed = parseExpression('first - last')
    if (parsed.kind !== 'binary') throw new Error('expected binary')
    expect(isStringConcatBinary(parsed.op, parsed.left, parsed.right, isStr)).toBe(false)
  })
})
