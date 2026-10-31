/**
 * Shared operand pairs for the relational operators `lt` / `le` / `gt` /
 * `ge` — JS Abstract Relational Comparison (spec/js-primitive-semantics.md,
 * "Relational"). Two strings compare by UTF-16 code unit; any other pair
 * goes through ToNumber, and a `NaN` makes the result false. `null < 1` is
 * true. Each operator file runs every pair, so the four files differ only
 * in the reference.
 */
import { type PrimitiveCase, type PrimitiveOp, pairDomain } from './types'

const pairs: Array<[unknown, unknown, string]> = [
  [1, 2, 'numbers, smaller first'],
  [2, 1, 'numbers, larger first'],
  [1, 1, 'equal numbers'],
  [-0, 0, '-0 and 0 are equal'],
  [1.5, 2, 'a fraction and an integer'],
  [Number.NaN, 1, 'NaN on the left'],
  [1, Number.NaN, 'NaN on the right'],
  [Number.NEGATIVE_INFINITY, -1e308, '-Infinity and the lowest finite magnitude'],
  ['a', 'b', 'strings by code unit'],
  ['abc', 'abd', 'strings differing in the last unit'],
  ['ab', 'abc', 'a prefix is smaller'],
  ['B', 'a', 'upper case sorts before lower case'],
  ['10', '9', 'numeric strings compare as strings'],
  ['', 'a', 'the empty string is smallest'],
  ['😀', '｡', 'an astral character against U+FF61 (UTF-16 units)'],
  ['é', 'z', 'a non-ASCII BMP character'],
  ['-2.0', 0, 'a numeric string against a number'],
  ['10', 9, 'a numeric string coerces against a number'],
  [' 3 ', 4, 'a padded numeric string coerces'],
  ['a', 0, 'a non-numeric string against a number is NaN'],
  ['', 1, 'the empty string against a number is 0'],
  [true, 2, 'true coerces to 1'],
  [false, true, 'two booleans coerce to numbers'],
  [null, 1, 'nil reads as null, which is 0'],
  [1, null, 'a number against nil'],
  [null, null, 'nil against nil'],
  [null, -1, 'nil against a negative number'],
]

export function relationalOp(fn: string, reference: (a: never, b: never) => boolean): PrimitiveOp {
  const cases: PrimitiveCase[] = pairs.map(([a, b, note]) => ({ fn, args: [a, b], domain: pairDomain(a, b), note }))
  return { fn, step: 3, reference, cases }
}
