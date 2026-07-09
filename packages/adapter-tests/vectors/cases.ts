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
  min: (a: unknown, b: unknown) => Math.min(Number(a), Number(b)),
  max: (a: unknown, b: unknown) => Math.max(Number(a), Number(b)),
  abs: (v: unknown) => Math.abs(Number(v)),
  to_fixed: (v: unknown, digits?: number) => Number(v).toFixed(digits ?? 0),
  lower: (s: string) => s.toLowerCase(),
  upper: (s: string) => s.toUpperCase(),
  trim: (s: string) => s.trim(),
  trim_start: (s: string) => s.trimStart(),
  trim_end: (s: string) => s.trimEnd(),
  starts_with: (s: string, prefix: string, position?: number) => s.startsWith(prefix, position),
  ends_with: (s: string, suffix: string, endPosition?: number) => s.endsWith(suffix, endPosition),
  replace: (s: string, pattern: string, replacement: string) => s.replace(pattern, replacement),
  replace_all: (s: string, pattern: string, replacement: string) => s.replaceAll(pattern, replacement),
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
  slice: (a: string | unknown[], start: number, end?: number) => a.slice(start, end),
  reverse: (a: unknown[]) => [...a].reverse(),
  // Depth -1 is the compiled Infinity sentinel (spec entry).
  flat: (a: unknown[], depth: number) => a.flat(depth === -1 ? Infinity : depth),
  // A DYNAMIC `.flat(depth)` (#2094): unlike `flat` above, there is no
  // compile-time `-1`-means-Infinity sentinel — the depth is whatever
  // render-time value the expression evaluates to, so the reference is
  // literal `.flat(depth)` and native JS's own `ToIntegerOrInfinity`
  // coercion does the work (truncate toward zero; NaN / negative → 0;
  // Infinity / a huge finite value → full flatten). This is a SEPARATE
  // canonical helper id, not an overload of `flat`, precisely because a
  // genuine depth of `-1` means the OPPOSITE thing here (no flatten) than
  // it does for the pre-normalised literal path.
  flat_dynamic: (a: unknown[], depth: unknown) => a.flat(depth as number),
  join: (a: unknown[], sep: string) => a.join(sep),
  arr: (...elements: unknown[]) => elements,
  filter_truthy: (a: unknown[]) => a.filter(Boolean),

  // searchParams() env-signal reader (#1922). The reference is the real
  // URLSearchParams.get the client runtime uses, so the template backends'
  // per-request readers (Go bf.SearchParams.Get / Perl
  // BarefootJS::SearchParams::get) are held to JS parity — with each
  // backend's deliberate divergence pinned in its harness (Go's url.Values.Get
  // returns "" for an absent key where JS returns null).
  search_params_get: (query: string, key: string) => new URLSearchParams(query).get(key),

  // queryHref()'s URL builder (#2042) as the SSR `query` / `bf_query` helper
  // receives it: a base plus a flat list of (include, key, value) triples. A
  // pair is kept iff its `include` flag is truthy AND its value is non-empty; a
  // repeated key overwrites at its first position (URLSearchParams.set). A value
  // may instead be an array, appending one pair per non-empty member
  // (URLSearchParams.append, #2048). The reference encodes through
  // URLSearchParams, so the Go (bf.Query) and Perl (BarefootJS::query) backends
  // are held to byte-identical form-encoding — space → '+', '~' → %7E, '*' kept,
  // UTF-8 byte-wise.
  query: (base: string, ...triples: unknown[]) => {
    const params = new URLSearchParams()
    for (let i = 0; i + 2 < triples.length; i += 3) {
      if (!triples[i]) continue
      const key = String(triples[i + 1])
      const value = triples[i + 2]
      if (Array.isArray(value)) {
        for (const member of value) {
          const m = String(member)
          if (m !== '') params.append(key, m)
        }
        continue
      }
      const val = String(value)
      if (val === '') continue
      params.set(key, val)
    }
    const s = params.toString()
    return s ? `${base}?${s}` : base
  },

  // Higher-order entries use the compiled projection catalogue as the
  // canonical argument form (spec: "canonical projection form") — the
  // references run the REAL JS array methods over predicates built
  // from those projections.
  every: (a: Record<string, unknown>[], field: string) => a.every((i) => i[field]),
  some: (a: Record<string, unknown>[], field: string) => a.some((i) => i[field]),
  filter: (a: Record<string, unknown>[], field: string, value: unknown) =>
    a.filter((i) => i[field] === value),
  find: (a: Record<string, unknown>[], field: string, value: unknown) =>
    a.find((i) => i[field] === value),
  find_index: (a: Record<string, unknown>[], field: string, value: unknown) =>
    a.findIndex((i) => i[field] === value),
  find_last: (a: Record<string, unknown>[], field: string, value: unknown) =>
    a.findLast((i) => i[field] === value),
  find_last_index: (a: Record<string, unknown>[], field: string, value: unknown) =>
    a.findLastIndex((i) => i[field] === value),
  sort: (items: unknown[], ...spec: string[]) => {
    const keys: Array<{ kind: string; name: string; type: string; dir: string }> = []
    for (let i = 0; i + 3 < spec.length; i += 4) {
      keys.push({ kind: spec[i], name: spec[i + 1], type: spec[i + 2], dir: spec[i + 3] })
    }
    const proj = (x: unknown, k: (typeof keys)[number]) =>
      k.kind === 'field' ? (x as Record<string, unknown>)[k.name] : x
    return [...items].sort((a, b) => {
      for (const k of keys) {
        const ka = proj(a, k)
        const kb = proj(b, k)
        let c: number
        if (k.type === 'string') c = String(ka).localeCompare(String(kb))
        else if (k.type === 'auto') c = (ka as never) > (kb as never) ? 1 : (ka as never) < (kb as never) ? -1 : 0
        else c = Number(ka) - Number(kb)
        if (c !== 0) return k.dir === 'desc' ? -c : c
      }
      return 0
    })
  },
  reduce: (
    items: unknown[],
    op: string,
    keyKind: string,
    key: string,
    type: string,
    init: string,
    direction: string,
  ) => {
    const proj = (x: unknown) => (keyKind === 'field' ? (x as Record<string, unknown>)[key] : x)
    const arr = direction === 'right' ? [...items].reverse() : items
    if (type === 'string') return arr.reduce<string>((acc, x) => acc + String(proj(x)), init)
    // Faithful JS `acc + x` / `acc * x`: `+` string-concatenates once
    // an operand is a string (the spec's numeric-string rule); the
    // seed is the compile-time numeric literal, hence Number(init).
    return arr.reduce<unknown>(
      (acc, x) =>
        op === '*' ? (acc as number) * (proj(x) as number) : (acc as never) + (proj(x) as never),
      Number(init),
    )
  },
  flat_map: (items: unknown[], keyKind: string, key: string) =>
    items.flatMap((x) => (keyKind === 'field' ? (x as Record<string, unknown>)[key] : x)),
  flat_map_tuple: (items: unknown[], ...specs: string[]) =>
    items.flatMap((x) => {
      const leaves: unknown[] = []
      for (let i = 0; i + 1 < specs.length; i += 2) {
        leaves.push(specs[i] === 'field' ? (x as Record<string, unknown>)[specs[i + 1]] : x)
      }
      return leaves
    }),
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

  { fn: 'min', args: [3, 7], note: 'first operand smaller' },
  { fn: 'min', args: [7, 3], note: 'second operand smaller (order-independent)' },
  { fn: 'min', args: [-2, -5], note: 'negative operands' },
  { fn: 'min', args: ['not', 5], note: 'NaN in first operand propagates' },
  { fn: 'min', args: [5, 'not'], note: 'NaN in second operand propagates' },

  { fn: 'max', args: [3, 7], note: 'second operand larger' },
  { fn: 'max', args: [7, 3], note: 'first operand larger (order-independent)' },
  { fn: 'max', args: [-2, -5], note: 'negative operands' },
  { fn: 'max', args: ['not', 5], note: 'NaN in first operand propagates' },
  { fn: 'max', args: [5, 'not'], note: 'NaN in second operand propagates' },

  { fn: 'abs', args: [-7.6], note: 'negative fractional operand' },
  { fn: 'abs', args: [7.6], note: 'positive operand is a no-op' },
  { fn: 'abs', args: [0], note: 'zero operand' },
  { fn: 'abs', args: ['not'], note: 'NaN propagates' },

  { fn: 'to_fixed', args: [316, 2], note: 'integer padded to 2 decimals (data-table amount)' },
  { fn: 'to_fixed', args: [3.14159, 2], note: 'rounds to 2 decimals' },
  { fn: 'to_fixed', args: [2.5, 0], note: 'zero digits rounds to integer string' },
  { fn: 'to_fixed', args: [1.005, 2], note: 'IEEE-754 double: 1.005 formats as 1.00 on all backends' },
  { fn: 'to_fixed', args: ['7.1', 3], note: 'numeric-string operand routes through number coercion' },

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

  // `trim_start` / `trim_end` mirror `trim`'s cases with a BOTH-SIDED
  // whitespace receiver as the flagship: a backend that swaps the two
  // (or routes either through the both-sides `trim` helper) produces a
  // visibly wrong side, so the case catches it.
  { fn: 'trim_start', args: ['  hi  '], note: 'strips only the leading side' },
  { fn: 'trim_start', args: ['\t\nx\r\n '], note: 'ASCII whitespace mix' },
  { fn: 'trim_start', args: ['no trim needed'], note: 'inner spaces preserved' },
  { fn: 'trim_start', args: ['   '], note: 'all-whitespace collapses to empty' },
  { fn: 'trim_start', args: [''], note: 'empty string' },

  { fn: 'trim_end', args: ['  hi  '], note: 'strips only the trailing side' },
  { fn: 'trim_end', args: ['\t\nx\r\n '], note: 'ASCII whitespace mix' },
  { fn: 'trim_end', args: ['no trim needed'], note: 'inner spaces preserved' },
  { fn: 'trim_end', args: ['   '], note: 'all-whitespace collapses to empty' },
  { fn: 'trim_end', args: [''], note: 'empty string' },

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

  // `replace_all` mirrors `replace`'s cases with a MULTI-OCCURRENCE
  // receiver as the flagship: a backend that reuses its first-only
  // `replace` helper here would produce 'X-b-a' instead of 'X-b-X',
  // so the case catches a swapped lowering the single-occurrence
  // `string-replaceall` fixture alone could not.
  { fn: 'replace_all', args: ['a-b-a', 'a', 'X'], note: 'every occurrence, not just the first' },
  { fn: 'replace_all', args: ['abc', 'z', 'X'], note: 'pattern not found leaves receiver unchanged' },
  { fn: 'replace_all', args: ['abc', '', 'X'], note: 'empty pattern inserts at every boundary' },
  { fn: 'replace_all', args: ['a.b.c', '.', '-'], note: 'pattern is literal, not regex' },
  { fn: 'replace_all', args: ['abc', 'b', ''], note: 'empty replacement deletes' },

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

  // String receiver (the `string-slice` divergence, #2182): the adapter
  // can't disambiguate a string from an array at compile time, so the
  // backend helper must dispatch on the runtime value's type the same
  // way `includes` already does.
  { fn: 'slice', args: ['barefootjs', 0, 4], note: 'string: start and end' },
  { fn: 'slice', args: ['barefootjs', -4], note: 'string: negative start counts from the end' },
  { fn: 'slice', args: ['barefootjs', 4], note: 'string: start only runs to the end' },
  { fn: 'slice', args: ['barefootjs', 5, 2], note: 'string: start past end yields empty string' },
  { fn: 'slice', args: ['héllo', 0, 2], note: 'string: multi-byte characters count as one unit each' },

  { fn: 'reverse', args: [[1, 2, 3]], note: 'basic reversal' },
  { fn: 'reverse', args: [[]], note: 'empty array' },
  { fn: 'reverse', args: [['only']], note: 'single element' },

  { fn: 'flat', args: [[[1, 2], [3]], 1], note: 'one level' },
  { fn: 'flat', args: [[1, [2, [3]]], 1], note: 'deeper nesting survives depth 1' },
  { fn: 'flat', args: [[1, [2, [3, [4]]]], -1], note: 'depth -1 is the Infinity sentinel' },
  { fn: 'flat', args: [[1, [2]], 0], note: 'depth 0 is a shallow copy' },

  // Dynamic `.flat(depth)` coercion (#2094, JS `ToIntegerOrInfinity`) — a
  // depth value that isn't known until render time.
  { fn: 'flat_dynamic', args: [[1, [2, [3]]], 2.7], note: 'float depth truncates toward zero (2.7 -> 2)' },
  { fn: 'flat_dynamic', args: [[1, [2, [3]]], -1], note: 'negative depth never recurses (shallow copy, NOT the literal-path Infinity sentinel)' },
  { fn: 'flat_dynamic', args: [[1, [2, [3]]], 0], note: 'depth 0 is a shallow copy (no-op)' },
  { fn: 'flat_dynamic', args: [[1, [2, [3, [4]]]], 1000000000], note: 'huge finite depth flattens fully' },
  { fn: 'flat_dynamic', args: [[1, [2, [3, [4]]]], 'Infinity'], note: 'a value that coerces to Infinity flattens fully' },
  { fn: 'flat_dynamic', args: [[1, [2, [3]]], 'not-a-number'], note: 'a non-numeric value coerces via NaN to depth 0' },

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

  { fn: 'every', args: [[{ done: true }, { done: true }], 'done'], note: 'all truthy fields' },
  { fn: 'every', args: [[{ done: true }, { done: false }], 'done'], note: 'one falsy field fails' },
  { fn: 'every', args: [[], 'done'], note: 'empty receiver is vacuously true' },
  { fn: 'some', args: [[{ done: false }, { done: true }], 'done'], note: 'one truthy field passes' },
  { fn: 'some', args: [[{ done: false }], 'done'], note: 'no truthy field fails' },
  { fn: 'some', args: [[], 'done'], note: 'empty receiver is false' },

  {
    fn: 'filter',
    args: [[{ s: 'a', n: 1 }, { s: 'b', n: 2 }, { s: 'a', n: 3 }], 's', 'a'],
    note: 'string field equality keeps matching items',
  },
  {
    fn: 'filter',
    args: [[{ s: 'a', n: 1 }, { s: 'b', n: 2 }], 'n', 2],
    note: 'numeric field equality',
  },
  { fn: 'filter', args: [[{ s: 'a' }], 's', 'z'], note: 'no match yields []' },

  {
    fn: 'find',
    args: [[{ id: 1, v: 'x' }, { id: 2, v: 'y' }], 'id', 2],
    note: 'returns the first matching element',
  },
  { fn: 'find', args: [[{ id: 1 }], 'id', 9], note: 'no match yields undefined ≡ null' },
  {
    fn: 'find_index',
    args: [[{ id: 1 }, { id: 2 }, { id: 2 }], 'id', 2],
    note: 'first matching index',
  },
  { fn: 'find_index', args: [[{ id: 1 }], 'id', 9], note: 'no match is -1' },
  {
    fn: 'find_last',
    args: [[{ id: 2, v: 'first' }, { id: 2, v: 'last' }], 'id', 2],
    note: 'returns the last matching element',
  },
  {
    fn: 'find_last_index',
    args: [[{ id: 1 }, { id: 2 }, { id: 2 }], 'id', 2],
    note: 'last matching index',
  },
  { fn: 'find_last_index', args: [[{ id: 1 }], 'id', 9], note: 'no match is -1' },

  { fn: 'sort', args: [[3, 1, 2], 'self', '', 'numeric', 'asc'], note: 'numeric self ascending' },
  { fn: 'sort', args: [[3, 1, 2], 'self', '', 'numeric', 'desc'], note: 'numeric self descending' },
  {
    fn: 'sort',
    args: [[{ p: 30 }, { p: 10 }, { p: 20 }], 'field', 'p', 'numeric', 'asc'],
    note: 'numeric field key',
  },
  {
    fn: 'sort',
    args: [['banana', 'apple', 'cherry'], 'self', '', 'string', 'asc'],
    note: 'string compare on same-case ASCII',
  },
  {
    fn: 'sort',
    args: [[{ p: 2.5 }, { p: 1.5 }], 'field', 'p', 'auto', 'asc'],
    note: 'auto compare with real numbers',
  },
  {
    fn: 'sort',
    args: [
      [{ a: 1, b: 2 }, { a: 1, b: 1 }, { a: 0, b: 9 }],
      'field', 'a', 'numeric', 'asc',
      'field', 'b', 'numeric', 'asc',
    ],
    note: 'multi-key tie-break',
  },
  { fn: 'sort', args: [[], 'self', '', 'numeric', 'asc'], note: 'empty receiver' },

  { fn: 'reduce', args: [[1, 2, 3], '+', 'self', '', 'numeric', '0', 'left'], note: 'sum fold' },
  { fn: 'reduce', args: [[2, 3, 4], '*', 'self', '', 'numeric', '1', 'left'], note: 'product fold' },
  {
    fn: 'reduce',
    args: [[{ d: 5 }, { d: 7 }], '+', 'field', 'd', 'numeric', '10', 'left'],
    note: 'field projection with non-zero init',
  },
  {
    fn: 'reduce',
    args: [['a', 'b', 'c'], '+', 'self', '', 'string', 'x', 'left'],
    note: 'string concatenation seeds with init',
  },
  {
    fn: 'reduce',
    args: [['a', 'b', 'c'], '+', 'self', '', 'string', 'x', 'right'],
    note: 'reduceRight is observable for string concat',
  },
  {
    fn: 'reduce',
    args: [[], '+', 'self', '', 'numeric', '5', 'left'],
    note: 'empty receiver returns the init',
  },

  { fn: 'flat_map', args: [[[1, 2], [3]], 'self', ''], note: 'self projection spreads one level' },
  {
    fn: 'flat_map',
    args: [[{ t: [1, 2] }, { t: [3] }], 'field', 't'],
    note: 'array-valued field spreads one level',
  },
  {
    fn: 'flat_map',
    args: [[{ t: 1 }, { t: 2 }], 'field', 't'],
    note: 'scalar field values are kept as-is',
  },
  {
    fn: 'flat_map_tuple',
    args: [[{ a: 1, b: 2 }, { a: 3, b: 4 }], 'field', 'a', 'field', 'b'],
    note: 'tuple leaves append in order per item',
  },
  {
    fn: 'flat_map_tuple',
    args: [[{ a: 1 }], 'self', '', 'field', 'a'],
    note: 'self leaf appends the element itself',
  },

  // ----- Divergence-region cases (JS-normative expects). Backends
  // that deliberately diverge pin their own value in their harness's
  // divergence declarations (spec: "Adapter status model").
  { fn: 'add', args: [9007199254740991, 2], note: 'beyond the safe-integer edge rounds as a double' },
  { fn: 'div', args: [7, 0], note: 'zero divisor yields Infinity' },
  { fn: 'mod', args: [-7, 3], note: 'remainder keeps the dividend sign' },
  { fn: 'mod', args: [7.5, 2], note: 'float remainder' },
  { fn: 'number', args: [''], note: 'empty string coerces to 0' },
  { fn: 'number', args: [null], note: 'null coerces to 0' },
  { fn: 'number', args: [' 8 '], note: 'surrounding whitespace is trimmed' },
  { fn: 'string', args: [null], note: 'null renders as the string "null"' },
  { fn: 'string', args: [true], note: 'true renders as the string "true"' },
  { fn: 'string', args: [0.30000000000000004], note: '17-significant-digit double round-trips' },
  { fn: 'round', args: [-1.5], note: 'negative half rounds toward +Infinity' },
  { fn: 'round', args: [-2.5], note: 'negative half rounds toward +Infinity (away tie)' },
  { fn: 'includes', args: [[1, 2], '2'], note: 'cross-type probe is strict-equality false' },
  { fn: 'filter_truthy', args: [['0', 'x']], note: 'the string "0" is truthy' },
  {
    fn: 'sort',
    args: [['B', 'a'], 'self', '', 'string', 'asc'],
    note: 'localeCompare orders case-insensitively (ICU collation)',
  },
  {
    fn: 'sort',
    args: [['10', '9'], 'self', '', 'auto', 'asc'],
    note: 'relational compare on numeric strings is lexical',
  },
  {
    fn: 'reduce',
    args: [['5', '6'], '+', 'self', '', 'numeric', '0', 'left'],
    note: 'numeric-string items concatenate under JS +',
  },

  // searchParams().get(key) (#1922) — request-query reader parity. URLSearchParams
  // parses application/x-www-form-urlencoded: leading `?` stripped, `+`/`%XX`
  // decoded, pairs split on the first `=`, `.get` returns the first value or null.
  { fn: 'search_params_get', args: ['sort=price', 'missing'], note: 'absent key is null' },
  { fn: 'search_params_get', args: ['sort=price', 'sort'], note: 'present key returns its value' },
  { fn: 'search_params_get', args: ['?sort=price', 'sort'], note: 'leading ? is stripped' },
  { fn: 'search_params_get', args: ['sort=a&sort=b', 'sort'], note: 'repeated key returns the first value' },
  { fn: 'search_params_get', args: ['a=1&b=2', 'b'], note: 'second pair resolves independently' },
  { fn: 'search_params_get', args: ['sort=', 'sort'], note: 'present-but-empty value stays empty string' },
  { fn: 'search_params_get', args: ['sort', 'sort'], note: 'bare key (no =) is present with empty value' },
  { fn: 'search_params_get', args: ['q=a+b', 'q'], note: 'plus decodes to space' },
  { fn: 'search_params_get', args: ['q=a%20b', 'q'], note: 'percent-encoded space decodes' },
  { fn: 'search_params_get', args: ['q=a%26b', 'q'], note: 'encoded & in a value is data, not a separator' },
  { fn: 'search_params_get', args: ['token=a=b=c', 'token'], note: 'only the first = splits; the rest is value' },

  // query() — the queryHref SSR builder. Control-flow rules (include flag,
  // empty-value omit, order, URLSearchParams.set overwrite) plus form-encoding
  // parity. The `~` / `*` vectors are exactly where Go's old url.QueryEscape
  // diverged from URLSearchParams (#2048).
  { fn: 'query', args: ['/'], note: 'no triples yields the bare base' },
  { fn: 'query', args: ['/', false, 'sort', 'title', false, 'tag', 'go'], note: 'all-excluded yields the bare base' },
  { fn: 'query', args: ['/', true, 'sort', 'title'], note: 'one included pair' },
  { fn: 'query', args: ['/blog', true, 'sort', 'title', true, 'tag', 'go'], note: 'order preserved' },
  { fn: 'query', args: ['/blog', false, 'sort', 'date', true, 'tag', 'go'], note: 'excluded pair dropped, included kept' },
  { fn: 'query', args: ['/', true, 'tag', ''], note: 'included-but-empty value is omitted' },
  { fn: 'query', args: ['/', true, 'sort', 'title', true, 'tag'], note: 'trailing partial triple ignored' },
  { fn: 'query', args: ['/', true, 'sort', 'title', true, 'sort', 'date'], note: 'repeated key overwrites at first position (set)' },
  { fn: 'query', args: ['/blog', true, 'sort', 'title', true, 'tag', 'go', true, 'sort', 'date'], note: 'overwrite keeps first position among others' },
  { fn: 'query', args: ['/', true, 'sort', 'title', false, 'sort', 'date'], note: 'excluded repeat does not overwrite' },
  { fn: 'query', args: ['/s', true, 't', 'a~b*c'], note: 'form-encode: ~ to %7E, * kept (URLSearchParams, not QueryEscape)' },
  { fn: 'query', args: ['/s', true, 'q', 'a b', true, 'x y', 'c&d'], note: 'form-encode: space to + in key and value, & to %26' },
  { fn: 'query', args: ['/s', true, 'q', 'café'], note: 'form-encode: UTF-8 byte-wise' },
  { fn: 'query', args: ['/s', true, 't', '100%~free*'], note: 'form-encode: % ~ * together' },
  // Array values append one pair per non-empty member (URLSearchParams.append, #2048).
  { fn: 'query', args: ['/list', true, 'tag', ['a', 'b']], note: 'array value appends one pair per member' },
  { fn: 'query', args: ['/list', true, 'sort', 'name', true, 'tag', ['a', 'b']], note: 'array interleaves with a scalar pair in order' },
  { fn: 'query', args: ['/list', true, 'tag', ['a', '', 'b']], note: 'empty array members are skipped' },
  { fn: 'query', args: ['/list', true, 'tag', []], note: 'empty array contributes nothing' },
  { fn: 'query', args: ['/list', true, 'sort', 'name', true, 'tag', []], note: 'array reduced to nothing leaves the scalar' },
  { fn: 'query', args: ['/s', true, 'tag', ['a b', 'c~d*']], note: 'array members are form-encoded like scalars' },
  { fn: 'query', args: ['/list', false, 'tag', ['a', 'b']], note: 'excluded array contributes nothing' },
]
