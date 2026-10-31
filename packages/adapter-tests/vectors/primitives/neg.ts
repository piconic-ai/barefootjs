/**
 * `neg` — JS unary `-` (spec/js-primitive-semantics.md, "Unary `-` and
 * number literals"): `-(ToNumber(x))`, keeping the sign of zero, so
 * `neg(0)` is `-0`. The `non-zero-number` domain is the only one the note
 * calls native-safe.
 */
import { type PrimitiveCase, type PrimitiveOp, unaryDomain } from './types'

const c = (v: unknown, note: string): PrimitiveCase => ({
  fn: 'neg',
  args: [v],
  domain: typeof v === 'number' && v !== 0 && !Number.isNaN(v) ? 'non-zero-number' : unaryDomain(v),
  note,
})

export const neg: PrimitiveOp = {
  fn: 'neg',
  step: 6,
  reference: (v: number) => -v,
  cases: [
    c(5, 'a positive integer'),
    c(-3, 'a negative integer'),
    c(1.5, 'a fraction'),
    c(0, '0 negates to -0'),
    c(-0, '-0 negates to 0'),
    c(Number.NaN, 'NaN stays NaN'),
    c(Number.POSITIVE_INFINITY, 'Infinity negates to -Infinity'),
    c('5', 'a numeric string coerces'),
    c('', 'the empty string coerces to 0 and negates to -0'),
    c('abc', 'a non-numeric string is NaN'),
    c(true, 'true negates to -1'),
    c(false, 'false negates to -0'),
    c(null, 'nil reads as null and negates to -0'),
  ],
}
