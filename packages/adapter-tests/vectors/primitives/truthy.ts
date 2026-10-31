/**
 * `truthy` — JS ToBoolean, the test of `if`, `?:`, `!`, `&&`, `||`
 * (spec/js-primitive-semantics.md, "ToBoolean"). `false`, `0`, `-0`, `NaN`,
 * `""` and nil are falsy; every other value is truthy, including `"0"`,
 * `"00"`, `" "`, `[]` and `{}`.
 */
import { type PrimitiveCase, type PrimitiveOp, unaryDomain } from './types'

const c = (v: unknown, note: string): PrimitiveCase => ({ fn: 'truthy', args: [v], domain: unaryDomain(v), note })

export const truthy: PrimitiveOp = {
  fn: 'truthy',
  step: 1,
  reference: (v: unknown) => Boolean(v),
  cases: [
    c(true, 'true is truthy'),
    c(false, 'false is falsy'),
    c(1, 'a non-zero number is truthy'),
    c(-2.5, 'a negative fraction is truthy'),
    c(0, '0 is falsy'),
    c(-0, '-0 is falsy'),
    c(Number.NaN, 'NaN is falsy'),
    c(Number.POSITIVE_INFINITY, 'Infinity is truthy'),
    c('a', 'a non-empty string is truthy'),
    c('0', 'the string "0" is truthy'),
    c('00', 'the string "00" is truthy'),
    c('false', 'the string "false" is truthy'),
    c(' ', 'a single space is truthy'),
    c('', 'the empty string is falsy'),
    c(null, 'nil is falsy'),
    c([], 'an empty array is truthy'),
    c([0], 'an array holding 0 is truthy'),
    c({}, 'an empty object is truthy'),
  ],
}
