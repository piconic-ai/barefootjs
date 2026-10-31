/**
 * `plus` — JS binary `+` (spec/js-primitive-semantics.md, "Binary `+`"):
 * if either operand is a string, ToString both and concatenate; otherwise
 * ToNumber both and add as doubles. A nil operand reads as `null` (the
 * runtimes hold one nil), so an omitted operand gives `'nullx'` against a
 * string and `0 + x` against a number; the `undefined` reading is refused
 * at compile time (rollout step 4).
 */
import { type PrimitiveCase, type PrimitiveOp, pairDomain } from './types'

const c = (a: unknown, b: unknown, note: string): PrimitiveCase => ({
  fn: 'plus',
  args: [a, b],
  domain: pairDomain(a, b),
  note,
})

export const plus: PrimitiveOp = {
  fn: 'plus',
  step: 4,
  reference: (a: number, b: number) => a + b,
  cases: [
    c(1, 2, 'two integers add'),
    c(0.1, 0.2, 'two doubles add'),
    c(9007199254740992, 1, 'past 2**53 the sum rounds as a double'),
    c(-0, -0, '-0 plus -0 is -0'),
    c(-0, 0, '-0 plus 0 is 0'),
    c(Number.NaN, 1, 'NaN propagates'),
    c('a', 'b', 'two strings concatenate'),
    c('1', '2', 'two numeric strings concatenate'),
    c('1', 2, 'a string on the left concatenates'),
    c(1, '2', 'a string on the right concatenates'),
    c('x', 1.5, 'a fraction prints with Number::toString'),
    c('x', 1e21, 'a large number prints in exponent notation'),
    c('', -0, '-0 prints as "0"'),
    c('x', Number.NaN, 'NaN prints as "NaN"'),
    c('x', true, 'a boolean prints as "true"'),
    c(true, 1, 'true adds as 1'),
    c(true, false, 'two booleans add as numbers'),
    c(null, 1, 'a nil operand against a number adds as 0'),
    c(null, 'x', 'a nil operand against a string prints as "null"'),
    c('x', null, 'a string against a nil operand'),
    c(null, null, 'two nil operands add as 0'),
    c([1, 2], '', 'an array against a string joins with a comma'),
    c('x', [], 'an empty array prints as the empty string'),
  ],
}
