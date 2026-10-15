import { describe, test, expect } from 'bun:test'
import { isAriaBooleanAttr, isBooleanResultExpr } from '../adapters/boolean-result.ts'

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
    // `parseExpression` always returns a `ParsedExpr` — for shapes it
    // can't categorise it lands on `{ kind: 'unsupported' }`, which
    // the classifier falls through to the default case and declines
    // to wrap. The contract here is "do not throw, do not wrap".
    expect(isBooleanResultExpr('???invalid<<')).toBe(false)
  })
})

describe('isAriaBooleanAttr', () => {
  test.each([
    // Strict boolean state.
    'aria-atomic',
    'aria-busy',
    'aria-disabled',
    'aria-hidden',
    'aria-modal',
    'aria-multiline',
    'aria-multiselectable',
    'aria-readonly',
    'aria-required',
    // Tri-state.
    'aria-checked',
    'aria-pressed',
  ])('%s is recognised as ARIA boolean', (name) => {
    expect(isAriaBooleanAttr(name)).toBe(true)
  })

  test.each([
    // String-valued / token-valued ARIA attributes — wrapping with
    // `bool_str` would coerce a user-supplied string to "true"/"false".
    'aria-label',
    'aria-labelledby',
    'aria-describedby',
    'aria-current', // page | step | location | … | true | false
    'aria-sort', // ascending | descending | none | other
    'aria-haspopup', // false | true | menu | listbox | tree | grid | dialog
    'aria-invalid', // false | true | grammar | spelling
    // Non-ARIA attributes — should also fall through.
    'disabled',
    'data-active',
    'class',
    'id',
  ])('%s is NOT recognised as ARIA boolean', (name) => {
    expect(isAriaBooleanAttr(name)).toBe(false)
  })
})
