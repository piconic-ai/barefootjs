/**
 * Golden-vector case definitions for the template helper catalogue
 * (spec/template-helpers.md).
 *
 * Each case names a canonical helper id and its arguments; the expected
 * value is COMPUTED by running the JS reference implementation below
 * (see generate.ts), never transcribed by hand — JS parity is
 * mechanical. Every case should pin a rule stated in the spec entry,
 * named by its `note`.
 */

export interface HelperCase {
  /** Canonical helper id from the spec catalogue (no bf_ prefix). */
  fn: string
  args: unknown[]
  /** Which spec rule this case pins. Copied into vectors.json. */
  note: string
}

/**
 * JS reference implementations — the semantic source of truth per
 * spec/template-helpers.md. These are deliberately the literal JS
 * expression each helper lowers (`a + b`, not a reimplementation), so
 * the vectors encode real JS engine behavior.
 */
export const reference: Record<string, (...args: never[]) => unknown> = {
  add: (a: number, b: number) => a + b,
}

export const cases: HelperCase[] = [
  { fn: 'add', args: [1, 2], note: 'int + int' },
  { fn: 'add', args: [10, -5], note: 'negative operand' },
  { fn: 'add', args: [0, 0], note: 'zero identity' },
  { fn: 'add', args: [1.5, 2.5], note: 'float + float with integral result value' },
  { fn: 'add', args: [1, 2.5], note: 'mixed int/float operands' },
  { fn: 'add', args: [0.1, 0.2], note: 'IEEE-754 double rounding' },
  { fn: 'add', args: [-1.5, -2.25], note: 'negative floats' },
  { fn: 'add', args: [9007199254740991, 1], note: 'upper edge of the safe-integer domain (2^53)' },
]
