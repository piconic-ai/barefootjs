/**
 * `to_string` — JS ToString, what `+` concatenation and a template-literal
 * part apply (spec/js-primitive-semantics.md, "ToString and boolean
 * values"). Numbers print as `Number::toString` (shortest round trip,
 * decimal in [1e-6, 1e21), `-0` → `"0"`); booleans as `"true"` / `"false"`;
 * a nil argument reads as `null` (→ `"null"`); an array joins its elements
 * with `,`, nil elements printing as `""`.
 */
import { type PrimitiveCase, type PrimitiveOp, unaryDomain } from './types'

const c = (v: unknown, note: string): PrimitiveCase => ({ fn: 'to_string', args: [v], domain: unaryDomain(v), note })

export const to_string: PrimitiveOp = {
  fn: 'to_string',
  step: 4,
  reference: (v: unknown) => String(v),
  cases: [
    c('abc', 'a string is itself'),
    c('', 'the empty string is itself'),
    c(42, 'an integer'),
    c(1.5, 'a fraction'),
    c(0.1 + 0.2, 'the shortest round-trip digits'),
    c(-0, '-0 prints as "0"'),
    c(Number.NaN, 'NaN'),
    c(Number.POSITIVE_INFINITY, 'Infinity'),
    c(Number.NEGATIVE_INFINITY, '-Infinity'),
    c(1e20, '1e20 prints in decimal'),
    c(1e21, '1e21 switches to exponent notation'),
    c(-1e21, '-1e21 switches to exponent notation'),
    c(1.5e300, 'a large exponent'),
    c(1e-6, '1e-6 prints in decimal'),
    c(1e-7, '1e-7 switches to exponent notation'),
    c(9007199254740992, '2**53 prints exactly'),
    c(true, 'true'),
    c(false, 'false'),
    c(null, 'nil reads as null'),
    c([], 'an empty array is the empty string'),
    c([1, 2], 'an array joins with a comma'),
    c(['a', null, true], 'a nil element prints as the empty string'),
    c([[1, 2], [3]], 'nested arrays flatten through the join'),
  ],
}
