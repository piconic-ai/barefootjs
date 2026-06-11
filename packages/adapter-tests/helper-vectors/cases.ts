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
  string: (v: unknown) => String(v),
  json: (v: unknown) => JSON.stringify(v),
  number: (v: unknown) => Number(v),
  floor: (v: unknown) => Math.floor(Number(v)),
  ceil: (v: unknown) => Math.ceil(Number(v)),
  round: (v: unknown) => Math.round(Number(v)),
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

  { fn: 'string', args: [42], note: 'integer' },
  { fn: 'string', args: [3.14], note: 'float within 15 significant digits' },
  { fn: 'string', args: [-7], note: 'negative integer' },
  { fn: 'string', args: ['hi'], note: 'string passthrough' },
  { fn: 'string', args: [''], note: 'empty string passthrough' },
  { fn: 'string', args: [0.5], note: 'fraction below one' },

  { fn: 'json', args: [42], note: 'top-level number' },
  { fn: 'json', args: ['hi'], note: 'top-level string is quoted' },
  { fn: 'json', args: [null], note: 'null serializes as "null"' },
  { fn: 'json', args: [[1, 2, 3]], note: 'array of ints' },
  { fn: 'json', args: [[1.5, 'x']], note: 'mixed array' },
  { fn: 'json', args: [{ a: 1 }], note: 'single-key object' },
  { fn: 'json', args: [{ a: 1, b: 'two' }], note: 'object with alphabetical insertion order' },
  { fn: 'json', args: [{ a: [1, { b: 'x' }] }], note: 'nested array/object' },

  { fn: 'number', args: [42], note: 'integer passthrough' },
  { fn: 'number', args: [3.14], note: 'float passthrough' },
  { fn: 'number', args: ['3.14'], note: 'numeric string' },
  { fn: 'number', args: ['42'], note: 'integer string' },
  { fn: 'number', args: ['1e3'], note: 'exponent notation string' },
  { fn: 'number', args: ['-0.5'], note: 'negative fraction string' },
  { fn: 'number', args: [true], note: 'true coerces to 1' },
  { fn: 'number', args: [false], note: 'false coerces to 0' },
  { fn: 'number', args: ['not a num'], note: 'non-numeric string is NaN (sentinel)' },
  { fn: 'number', args: ['NaN'], note: 'the literal string "NaN" parses to NaN on all backends' },

  { fn: 'floor', args: [3.7], note: 'positive truncation' },
  { fn: 'floor', args: [-3.7], note: 'negative rounds away from zero' },
  { fn: 'floor', args: [5], note: 'integral passthrough' },
  { fn: 'floor', args: ['2.9'], note: 'numeric-string operand routes through number coercion' },

  { fn: 'ceil', args: [3.2], note: 'positive rounds up' },
  { fn: 'ceil', args: [-3.2], note: 'negative rounds toward zero' },
  { fn: 'ceil', args: [5], note: 'integral passthrough' },

  { fn: 'round', args: [2.5], note: 'positive half rounds up on all backends' },
  { fn: 'round', args: [2.4], note: 'below half rounds down' },
  { fn: 'round', args: [-2.4], note: 'negative below half rounds toward zero' },
  { fn: 'round', args: [7], note: 'integral passthrough' },
  { fn: 'round', args: ['6.6'], note: 'numeric-string operand routes through number coercion' },
]
