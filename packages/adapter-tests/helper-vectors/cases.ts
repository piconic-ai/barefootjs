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
  lower: (s: string) => s.toLowerCase(),
  upper: (s: string) => s.toUpperCase(),
  trim: (s: string) => s.trim(),
  starts_with: (s: string, prefix: string, position?: number) => s.startsWith(prefix, position),
  ends_with: (s: string, suffix: string, endPosition?: number) => s.endsWith(suffix, endPosition),
  replace: (s: string, pattern: string, replacement: string) => s.replace(pattern, replacement),
  repeat: (s: string, n: number) => s.repeat(n),
  pad_start: (s: string, target: number, pad?: string) => s.padStart(target, pad),
  pad_end: (s: string, target: number, pad?: string) => s.padEnd(target, pad),
  split: (s: string, sep: string, limit?: number) => s.split(sep, limit),
  len: (v: string | unknown[]) => v.length,
  at: (a: unknown[], i: number) => a.at(i),
  includes: (recv: string | unknown[], x: never) => recv.includes(x),
  index_of: (a: unknown[], x: unknown) => a.indexOf(x),
  last_index_of: (a: unknown[], x: unknown) => a.lastIndexOf(x),
  concat: (a: unknown[], b: unknown[]) => a.concat(b),
  slice: (a: unknown[], start: number, end?: number) => a.slice(start, end),
  reverse: (a: unknown[]) => [...a].reverse(),
  // Depth -1 is the compiled Infinity sentinel (spec entry).
  flat: (a: unknown[], depth: number) => a.flat(depth === -1 ? Infinity : depth),
  join: (a: unknown[], sep: string) => a.join(sep),
  arr: (...elements: unknown[]) => elements,
  filter_truthy: (a: unknown[]) => a.filter(Boolean),
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

  { fn: 'lower', args: ['HeLLo'], note: 'mixed case' },
  { fn: 'lower', args: ['ABC123'], note: 'digits pass through' },
  { fn: 'lower', args: [''], note: 'empty string' },
  { fn: 'upper', args: ['HeLLo'], note: 'mixed case' },
  { fn: 'upper', args: ['abc-def'], note: 'punctuation passes through' },

  { fn: 'trim', args: ['  hi  '], note: 'surrounding spaces' },
  { fn: 'trim', args: ['\t\nx\r\n '], note: 'ASCII whitespace mix' },
  { fn: 'trim', args: ['no trim needed'], note: 'inner spaces preserved' },
  { fn: 'trim', args: ['   '], note: 'all-whitespace collapses to empty' },
  { fn: 'trim', args: [''], note: 'empty string' },

  { fn: 'starts_with', args: ['hello', 'he'], note: 'matching prefix' },
  { fn: 'starts_with', args: ['hello', 'lo'], note: 'non-prefix substring' },
  { fn: 'starts_with', args: ['hello', ''], note: 'empty prefix is always true' },
  { fn: 'starts_with', args: ['abc', 'b', 1], note: 'position re-anchors the test' },
  { fn: 'starts_with', args: ['abc', 'a', 1], note: 'position moves past the match' },
  { fn: 'starts_with', args: ['abc', '', 5], note: 'position beyond length clamps' },

  { fn: 'ends_with', args: ['hello', 'lo'], note: 'matching suffix' },
  { fn: 'ends_with', args: ['hello', 'he'], note: 'non-suffix substring' },
  { fn: 'ends_with', args: ['hello', ''], note: 'empty suffix is always true' },
  { fn: 'ends_with', args: ['abc', 'b', 2], note: 'endPosition shortens the receiver' },
  { fn: 'ends_with', args: ['abc', 'c', 2], note: 'endPosition excludes the real suffix' },
  { fn: 'ends_with', args: ['abc', 'abcd'], note: 'suffix longer than receiver' },

  { fn: 'replace', args: ['a-b-a', 'a', 'X'], note: 'first occurrence only' },
  { fn: 'replace', args: ['abc', 'z', 'X'], note: 'pattern not found leaves receiver unchanged' },
  { fn: 'replace', args: ['abc', '', 'X'], note: 'empty pattern inserts at the front' },
  { fn: 'replace', args: ['a.b.c', '.', '-'], note: 'pattern is literal, not regex' },
  { fn: 'replace', args: ['abc', 'b', ''], note: 'empty replacement deletes' },

  { fn: 'repeat', args: ['ab', 3], note: 'basic repetition' },
  { fn: 'repeat', args: ['x', 0], note: 'zero count is empty' },
  { fn: 'repeat', args: ['', 5], note: 'empty receiver stays empty' },
  { fn: 'repeat', args: ['-', 1], note: 'single repetition' },

  { fn: 'pad_start', args: ['5', 3, '0'], note: 'zero-padding numbers' },
  { fn: 'pad_start', args: ['hi', 4], note: 'pad defaults to a single space' },
  { fn: 'pad_start', args: ['a', 4, 'xyz'], note: 'pad truncates to fill exactly' },
  { fn: 'pad_start', args: ['abc', 2, '0'], note: 'target below length returns receiver' },
  { fn: 'pad_start', args: ['ab', 5, ''], note: 'empty pad returns receiver unchanged' },
  { fn: 'pad_start', args: ['a', 6, '12'], note: 'pad repeats then truncates' },
  { fn: 'pad_end', args: ['5', 3, '0'], note: 'right-padding numbers' },
  { fn: 'pad_end', args: ['hi', 4], note: 'pad defaults to a single space' },
  { fn: 'pad_end', args: ['a', 4, 'xyz'], note: 'pad truncates to fill exactly' },
  { fn: 'pad_end', args: ['abc', 2, '0'], note: 'target below length returns receiver' },

  { fn: 'split', args: ['a,b,c', ','], note: 'basic comma split' },
  { fn: 'split', args: ['a,', ','], note: 'trailing empty field is kept' },
  { fn: 'split', args: ['abc', ''], note: 'empty separator splits into characters' },
  { fn: 'split', args: ['a,b,c', ',', 2], note: 'limit caps the pieces' },
  { fn: 'split', args: ['abc', '-'], note: 'separator not found yields whole string' },
  { fn: 'split', args: ['', ','], note: 'empty receiver yields one empty field' },
  { fn: 'split', args: ['', ''], note: 'empty receiver with empty separator yields []' },
  { fn: 'split', args: ['a,b,c', ',', 0], note: 'zero limit yields []' },

  { fn: 'len', args: [[10, 20, 30]], note: 'array element count' },
  { fn: 'len', args: [[]], note: 'empty array' },
  { fn: 'len', args: ['hello'], note: 'ASCII string character count' },
  { fn: 'len', args: [''], note: 'empty string' },

  { fn: 'at', args: [[10, 20, 30], 1], note: 'positive index' },
  { fn: 'at', args: [[10, 20, 30], -1], note: 'negative index counts from the end' },
  { fn: 'at', args: [[10, 20, 30], 5], note: 'out of range yields undefined ≡ null' },
  { fn: 'at', args: [[10, 20, 30], -5], note: 'negative out of range yields undefined ≡ null' },
  { fn: 'at', args: [[], 0], note: 'empty array yields undefined ≡ null' },

  { fn: 'includes', args: [[1, 2, 3], 2], note: 'array contains number' },
  { fn: 'includes', args: [[1, 2, 3], 5], note: 'array missing number' },
  { fn: 'includes', args: [['a', 'b'], 'a'], note: 'array contains string' },
  { fn: 'includes', args: ['hello', 'ell'], note: 'string receiver does substring test' },
  { fn: 'includes', args: ['hello', 'z'], note: 'string receiver, absent substring' },

  { fn: 'index_of', args: [[1, 2, 1], 1], note: 'first match wins' },
  { fn: 'index_of', args: [['a', 'b'], 'b'], note: 'string element' },
  { fn: 'index_of', args: [[1, 2, 3], 9], note: 'not found is -1' },
  { fn: 'last_index_of', args: [[1, 2, 1], 1], note: 'last match wins' },
  { fn: 'last_index_of', args: [[1, 2, 3], 9], note: 'not found is -1' },

  { fn: 'concat', args: [[1, 2], [3]], note: 'order preserved, receiver first' },
  { fn: 'concat', args: [[], [1]], note: 'empty receiver' },
  { fn: 'concat', args: [['a'], []], note: 'empty argument' },

  { fn: 'slice', args: [[1, 2, 3, 4], 1], note: 'start only runs to the end' },
  { fn: 'slice', args: [[1, 2, 3, 4], 1, 3], note: 'start and end' },
  { fn: 'slice', args: [[1, 2, 3, 4], -2], note: 'negative start counts from the end' },
  { fn: 'slice', args: [[1, 2, 3, 4], 0, -1], note: 'negative end drops the tail' },
  { fn: 'slice', args: [[1, 2, 3, 4], 2, 1], note: 'start past end yields []' },
  { fn: 'slice', args: [[1, 2, 3, 4], 0, 99], note: 'end clamps to length' },

  { fn: 'reverse', args: [[1, 2, 3]], note: 'basic reversal' },
  { fn: 'reverse', args: [[]], note: 'empty array' },
  { fn: 'reverse', args: [['only']], note: 'single element' },

  { fn: 'flat', args: [[[1, 2], [3]], 1], note: 'one level' },
  { fn: 'flat', args: [[1, [2, [3]]], 1], note: 'deeper nesting survives depth 1' },
  { fn: 'flat', args: [[1, [2, [3, [4]]]], -1], note: 'depth -1 is the Infinity sentinel' },
  { fn: 'flat', args: [[1, [2]], 0], note: 'depth 0 is a shallow copy' },

  { fn: 'join', args: [[1, 2, 3], ','], note: 'numeric elements stringify' },
  { fn: 'join', args: [['a', 'b'], ' - '], note: 'multi-char separator' },
  { fn: 'join', args: [[], ','], note: 'empty array joins to empty string' },
  { fn: 'join', args: [[1, null, 2], ','], note: 'null elements render as empty' },
  { fn: 'join', args: [['solo'], ','], note: 'single element has no separator' },

  { fn: 'arr', args: [1, 'x'], note: 'variadic elements in order' },
  { fn: 'arr', args: [], note: 'empty literal' },
  { fn: 'arr', args: [5], note: 'single element' },

  { fn: 'filter_truthy', args: [[0, 1, '', 2, null, 'a']], note: 'drops the JS falsy set' },
  { fn: 'filter_truthy', args: [['x', 'y']], note: 'all truthy passes through' },
  { fn: 'filter_truthy', args: [[0, '', null]], note: 'all falsy yields []' },
]
