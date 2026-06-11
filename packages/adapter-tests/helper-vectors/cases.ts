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
  sub: (a: number, b: number) => a - b,
  mul: (a: number, b: number) => a * b,
  div: (a: number, b: number) => a / b,
  mod: (a: number, b: number) => a % b,
  neg: (a: number) => -a,
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

  { fn: 'sub', args: [5, 3], note: 'int - int' },
  { fn: 'sub', args: [3, 5], note: 'negative result' },
  { fn: 'sub', args: [0.3, 0.1], note: 'IEEE-754 double rounding' },
  { fn: 'sub', args: [1.5, 0.25], note: 'float operands' },
  { fn: 'sub', args: [0, 0], note: 'zero identity' },

  { fn: 'mul', args: [3, 4], note: 'int * int' },
  { fn: 'mul', args: [-3, 4], note: 'negative operand' },
  { fn: 'mul', args: [0.1, 0.2], note: 'IEEE-754 double rounding' },
  { fn: 'mul', args: [1.5, 2], note: 'float * int with integral result value' },
  { fn: 'mul', args: [0, 5], note: 'zero annihilator' },

  { fn: 'div', args: [7, 2], note: 'integer operands divide as doubles (3.5)' },
  { fn: 'div', args: [10, 5], note: 'exact integer quotient' },
  { fn: 'div', args: [1, 3], note: 'repeating fraction at double precision' },
  { fn: 'div', args: [-9, 3], note: 'negative dividend' },
  { fn: 'div', args: [0.3, 0.1], note: 'IEEE-754 double rounding (not exactly 3)' },
  { fn: 'div', args: [0, 7], note: 'zero dividend' },

  { fn: 'mod', args: [7, 3], note: 'basic remainder' },
  { fn: 'mod', args: [10, 5], note: 'zero remainder' },
  { fn: 'mod', args: [9, 4], note: 'remainder of one' },
  { fn: 'mod', args: [0, 3], note: 'zero dividend' },

  { fn: 'neg', args: [5], note: 'positive int' },
  { fn: 'neg', args: [-3], note: 'negative int negates back' },
  { fn: 'neg', args: [1.5], note: 'float' },
  { fn: 'neg', args: [0], note: 'zero (sign of float zero not observable in JSON)' },
]
