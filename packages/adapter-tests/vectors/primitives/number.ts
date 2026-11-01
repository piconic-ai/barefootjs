/**
 * `number` over a number literal's JS spelling — the number-literal plan
 * (spec/js-primitive-semantics.md, "Unary `-` and number literals"). A
 * literal that is not a safe integer is spelled `number('<String(v)>')`,
 * so no target needs an exponent or big-integer literal syntax; `-0` is
 * spelled `neg(0)` and has no case here. The argument is always the JS
 * spelling `String(v)`, which is what the emitters write.
 *
 * The `safe-integer` domain is the one the note calls native-safe: a
 * harness's native binding parses the argument with its host's own literal
 * syntax (a Go template constant, a Perl, PHP or Ruby literal, a Jinja,
 * MiniJinja or Pebble literal), as a template does when the literal is
 * emitted natively.
 */
import { type PrimitiveCase, type PrimitiveOp } from './types'

const c = (v: number, note: string): PrimitiveCase => ({
  fn: 'number',
  args: [String(v)],
  domain: Number.isSafeInteger(v) ? 'safe-integer' : 'number',
  note,
})

export const number: PrimitiveOp = {
  fn: 'number',
  step: 6,
  reference: (s: string) => Number(s),
  cases: [
    c(0, 'zero'),
    c(7, 'a positive integer'),
    c(-3, 'a negative integer'),
    c(Number.MAX_SAFE_INTEGER, 'the largest safe integer'),
    c(Number.MIN_SAFE_INTEGER, 'the smallest safe integer'),
    c(2 ** 53, '2^53 is past the safe integers'),
    c(1e20, '1e20 spells as 21 digits'),
    c(-1e20, '-1e20 spells as a negative 21-digit integer'),
    c(1e21, '1e21 spells in exponent form'),
    c(1e-7, '1e-7 spells in exponent form'),
    c(1.5e-7, 'a fraction in exponent form'),
    c(0.1, 'a decimal fraction'),
    c(-1.5, 'a negative fraction'),
    c(Number.MAX_VALUE, 'the largest double'),
    c(Number.MIN_VALUE, 'the smallest denormal'),
  ],
}
