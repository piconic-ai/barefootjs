import { describe, test, expect } from 'bun:test'
import { isBooleanResultExpr } from '../boolean-result'

describe('isBooleanResultExpr', () => {
  describe('detected as boolean-result', () => {
    test.each([
      // Top-level comparison
      ['count() > 0'],
      ['x === y'],
      ['a !== b'],
      ['x >= 10'],
      ['a == b'],
      // Unary logical NOT
      ['!accepted()'],
      ['!ok'],
      // Boolean literals
      ['true'],
      ['false'],
      // Logical combinator with both sides boolean
      ['x > 0 && y < 10'],
      ['!a || b === c'],
      // Conditional with both branches boolean
      ['cond ? true : false'],
      ['x > 0 ? x === 1 : !y'],
    ])('"%s" is boolean-result', expr => {
      expect(isBooleanResultExpr(expr)).toBe(true)
    })
  })

  describe('not boolean-result', () => {
    test.each([
      // Bare identifier — could be anything; the adapter has no
      // type info from source text. Leave unwrapped.
      ['accepted'],
      ['count'],
      // Call expression — same reason.
      ['accepted()'],
      ['user.isAdmin()'],
      // Member access
      ['props.checked'],
      // Numeric / string / null literal
      ['0'],
      ['"hello"'],
      ['null'],
      // Template literal (handled by a separate emit path)
      ['`${name}`'],
      // Logical fallback whose right side is non-boolean — `||
      // 'fallback'` returns a string, not a boolean
      ['x() || "fallback"'],
      // Conditional with non-boolean branches
      ['cond ? "yes" : "no"'],
      ['ok() ? count() : 0'],
      // Arithmetic — `+` is not a comparison
      ['a + b'],
    ])('"%s" is NOT boolean-result', expr => {
      expect(isBooleanResultExpr(expr)).toBe(false)
    })
  })

  test('returns false for unparseable input', () => {
    // `parseExpression` returns null / unsupported for garbage; the
    // classifier should not throw, just decline to wrap.
    expect(isBooleanResultExpr('???invalid<<')).toBe(false)
  })
})
