/**
 * `strict_eq` — JS `===` over primitives (spec/js-primitive-semantics.md,
 * "`===` / `!==`"): same type and same value, no coercion; `NaN !== NaN`,
 * `0 === -0`, nil equals only nil. Objects and arrays are out of this
 * corpus: a template adapter refuses a `===` over one with BF101 (rollout
 * step 8, "Decisions" (4)).
 */
import { type PrimitiveCase, type PrimitiveOp, pairDomain } from './types'

const c = (a: unknown, b: unknown, note: string): PrimitiveCase => ({
  fn: 'strict_eq',
  args: [a, b],
  domain: pairDomain(a, b),
  note,
})

export const strict_eq: PrimitiveOp = {
  fn: 'strict_eq',
  step: 8,
  reference: (a: unknown, b: unknown) => a === b,
  cases: [
    c(1, 1, 'equal integers'),
    c(1, 2, 'different integers'),
    c(0.1 + 0.2, 0.3, 'doubles compare exactly'),
    c(0, -0, '0 equals -0'),
    c(Number.NaN, Number.NaN, 'NaN does not equal NaN'),
    c(Number.NaN, 1, 'NaN does not equal a number'),
    c('a', 'a', 'equal strings'),
    c('a', 'b', 'different strings'),
    c('1e0', '1', 'numeric strings compare as strings'),
    c('', '', 'two empty strings'),
    c(true, true, 'equal booleans'),
    c(true, false, 'different booleans'),
    c(1, '1', 'a number never equals a string'),
    c(0, '', 'zero never equals the empty string'),
    c(true, 1, 'true never equals 1'),
    c(false, 0, 'false never equals 0'),
    c('true', true, 'the string "true" never equals true'),
    c(null, null, 'nil equals nil'),
    c(null, 0, 'nil never equals 0'),
    c(null, '', 'nil never equals the empty string'),
    c(false, null, 'false never equals nil'),
  ],
}
