/**
 * `to_number` — JS ToNumber, the operand coercion of `- * / %`, unary
 * `+` / `-` and the relational operators (spec/js-primitive-semantics.md,
 * "ToNumber"). Strings are trimmed; `""` is 0; a numeric literal (decimal,
 * exponent, `0x` / `0o` / `0b`, `Infinity`) is its value; anything else is
 * `NaN`. A nil argument reads as `null` (→ 0), as the evaluator's
 * `_to_number` does: the nil-reading rewrite runs before the helper.
 */
import { type PrimitiveCase, type PrimitiveOp, unaryDomain } from './types'

const c = (v: unknown, note: string): PrimitiveCase => ({ fn: 'to_number', args: [v], domain: unaryDomain(v), note })

export const to_number: PrimitiveOp = {
  fn: 'to_number',
  step: 3,
  reference: (v: unknown) => Number(v),
  cases: [
    c(42, 'a number is itself'),
    c(-1.5, 'a negative fraction is itself'),
    c(-0, '-0 keeps its sign'),
    c(true, 'true is 1'),
    c(false, 'false is 0'),
    c(null, 'nil reads as null and is 0'),
    c('', 'the empty string is 0'),
    c('   ', 'a whitespace-only string is 0'),
    c(' 8 ', 'surrounding whitespace is trimmed'),
    c('\n8\t', 'newline and tab are trimmed'),
    c('42', 'a decimal integer string'),
    c('1.5', 'a decimal fraction string'),
    c('.5', 'a fraction string without an integer part'),
    c('5.', 'a string with a trailing decimal point'),
    c('+5', 'a leading plus sign'),
    c('-2.0', 'a negative decimal string'),
    c('-0', 'the string "-0" is -0'),
    c('1e5', 'an exponent string'),
    c('1E-3', 'an upper-case negative exponent'),
    c('1e1000', 'an overflowing exponent is Infinity'),
    c('Infinity', 'the string "Infinity"'),
    c('-Infinity', 'the string "-Infinity"'),
    c('infinity', 'a lower-case "infinity" is NaN'),
    c('0x10', 'a hex string is its value'),
    c('0b11', 'a binary string is its value'),
    c('0o17', 'an octal string is its value'),
    c('-0x10', 'a signed hex string is NaN'),
    c('1_000', 'a digit separator is NaN'),
    c('abc', 'a non-numeric string is NaN'),
    c('12px', 'a numeric prefix with a suffix is NaN'),
    c('NaN', 'the string "NaN" is NaN'),
  ],
}
