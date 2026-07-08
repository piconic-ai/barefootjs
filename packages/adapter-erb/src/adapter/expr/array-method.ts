/**
 * Array / string method lowering for the ERB template adapter.
 *
 * Ported from the Mojolicious adapter's `expr/array-method.ts` (issue #2018
 * track D lineage). Pure free functions shared by both the filter-context
 * emitter and the top-level emitter — they take an `emit` callback for
 * receiver / argument recursion and read no adapter instance state.
 *
 * Every `bf.*` helper name below is kept 1:1 with the Perl (`BarefootJS.pm`)
 * / Go runtime surface — the coordination contract between this TS emitter
 * and the Ruby runtime (`lib/barefoot_js.rb`).
 */

import {
  serializeParsedExpr,
  freeVarsInBody,
} from '@barefootjs/jsx'
import type {
  ParsedExpr,
  ArrayMethod,
  SortComparator,
  FlatDepth,
} from '@barefootjs/jsx'
import { rubySymbolKey, escapeRubySingleQuoted } from '../lib/ruby-naming.ts'

/**
 * Lower an `arr.<method>(...)` / `str.<method>(...)` value-builtin call to
 * its Ruby form. The IR lifts these into the dedicated `array-method` kind at
 * parse time (see the `arrayMethod` emitter arms), so this is the single
 * place every adapter-supported array/string method is mapped. An unhandled
 * `ArrayMethod` variant throws rather than emitting a silent no-op — the
 * drift defence we already apply to `ParsedExpr.kind` extended to its
 * sub-discriminator.
 */
export function renderArrayMethod(
  method: ArrayMethod,
  object: ParsedExpr,
  args: ParsedExpr[],
  emit: (e: ParsedExpr) => string,
): string {
  switch (method) {
    case 'join': {
      // arr.join(sep) → bf.join(arr, sep). `.join()` defaults the separator
      // to `,` (JS) and ignores any extra argument.
      const obj = emit(object)
      const sep = args.length >= 1 ? emit(args[0]) : `','`
      return `bf.join(${obj}, ${sep})`
    }
    case 'includes': {
      // Both `arr.includes(x)` and `str.includes(sub)` route here — the
      // parser can't disambiguate the receiver type. The Ruby runtime's
      // `bf.includes(recv, elem)` inspects the receiver's class and
      // dispatches: Array scans the list with `==`, String falls back to
      // substring search. Helper lives in lib/barefoot_js.rb.
      const obj = emit(object)
      const needle = emit(args[0])
      return `bf.includes(${obj}, ${needle})`
    }
    case 'indexOf':
    case 'lastIndexOf': {
      // Array `.indexOf(x)` / `.lastIndexOf(x)` value-equality search.
      const fn = method === 'indexOf' ? 'index_of' : 'last_index_of'
      const obj = emit(object)
      const needle = emit(args[0])
      return `bf.${fn}(${obj}, ${needle})`
    }
    case 'at': {
      // `.at(i)` with negative-index support — `.at(-1)` is the last
      // element. `.at()` with no argument is `.at(0)` (the first element);
      // extra arguments are ignored.
      const obj = emit(object)
      const idx = args.length >= 1 ? emit(args[0]) : '0'
      return `bf.at(${obj}, ${idx})`
    }
    case 'concat': {
      // `.concat(other)` merges two arrays. Returns a new Array so the
      // result composes with `.join(...)` / other array-shape methods
      // downstream. `.concat()` with no argument is a shallow copy —
      // indistinguishable from the receiver in an SSR snapshot, so it
      // lowers to the receiver.
      if (args.length === 0) {
        return emit(object)
      }
      const a = emit(object)
      const b = emit(args[0])
      return `bf.concat(${a}, ${b})`
    }
    case 'slice': {
      // `.slice()` / `.slice(start)` / `.slice(start, end)`. The Ruby
      // helper mirrors the Go arithmetic (negative-index normalisation,
      // out-of-bounds clamping, empty result on start >= end). A missing
      // `start` defaults to 0 (full copy); an absent `end` lowers as `nil`,
      // which the helper treats as "to length". JS ignores a third+
      // argument. Returns a new Array so the result composes with
      // `.join(...)` downstream.
      const recv = emit(object)
      const start = args.length >= 1 ? emit(args[0]) : '0'
      const end = args.length >= 2 ? emit(args[1]) : 'nil'
      return `bf.slice(${recv}, ${start}, ${end})`
    }
    case 'reverse':
    case 'toReversed': {
      // Both shapes share a lowering — see the parser arm + Go emit for the
      // SSR-mutation rationale. Returns a new Array so the result composes
      // with `.join(...)` downstream.
      const recv = emit(object)
      return `bf.reverse(${recv})`
    }
    case 'toLowerCase': {
      // Ruby's native `.downcase` is the obvious lowering — no helper
      // method needed. The receiver flows through `emit` so any upstream
      // coercion composes naturally.
      const recv = emit(object)
      return `(${recv}).downcase`
    }
    case 'toUpperCase': {
      // Ruby's native `.upcase` — mirrors `toLowerCase` exactly.
      const recv = emit(object)
      return `(${recv}).upcase`
    }
    case 'trim': {
      // No JS-parity-guaranteed native for leading/trailing whitespace
      // (Ruby `.strip` strips a slightly different whitespace class);
      // route through `bf.trim` so the definition stays in one place.
      const recv = emit(object)
      return `bf.trim(${recv})`
    }
    case 'trimStart':
    case 'trimEnd': {
      // `.trimStart()` / `.trimEnd()` — the one-sided siblings of
      // `.trim()` (#2183 follow-up). Dedicated `bf.trim_start` /
      // `bf.trim_end` helpers, not `bf.trim` with a flag.
      const fn = method === 'trimStart' ? 'trim_start' : 'trim_end'
      const recv = emit(object)
      return `bf.${fn}(${recv})`
    }
    case 'toFixed': {
      // `.toFixed(digits?)` — Number → fixed-decimal string. `bf.to_fixed`
      // mirrors JS rounding + zero-padding (default 0 digits).
      const recv = emit(object)
      const digits = args.length >= 1 ? emit(args[0]) : '0'
      return `bf.to_fixed(${recv}, ${digits})`
    }
    case 'split': {
      // `.split()` / `.split(sep)` / `.split(sep, limit)` — string → Array
      // via `bf.split`. With no separator the helper returns the whole
      // string as a single element; otherwise it matches the separator
      // literally (not as a regex) and keeps trailing empties, staying
      // byte-equal with Go's `bf_split`. The optional `limit` caps the
      // pieces; JS ignores a third+ argument.
      const recv = emit(object)
      if (args.length === 0) {
        return `bf.split(${recv})`
      }
      const sep = emit(args[0])
      if (args.length === 1) {
        return `bf.split(${recv}, ${sep})`
      }
      const limit = emit(args[1])
      return `bf.split(${recv}, ${sep}, ${limit})`
    }
    case 'startsWith':
    case 'endsWith': {
      // `.startsWith(prefix, position?)` / `.endsWith(suffix, endPosition?)`
      // — string → boolean. The Ruby helpers (`bf.starts_with` /
      // `bf.ends_with`) do an index-anchored comparison so the search
      // string is matched literally (no regex metachar surprises) and a
      // nil receiver stays quiet. The optional second argument re-anchors
      // the test; JS ignores a third+ argument.
      const fn = method === 'startsWith' ? 'starts_with' : 'ends_with'
      const recv = emit(object)
      const arg = emit(args[0])
      if (args.length >= 2) {
        return `bf.${fn}(${recv}, ${arg}, ${emit(args[1])})`
      }
      return `bf.${fn}(${recv}, ${arg})`
    }
    case 'replace': {
      // `.replace(old, new)` — string-pattern form, first occurrence. The
      // `bf.replace` helper splices via index/substring (not a Regexp) so
      // both the pattern and the replacement are literal — no Ruby regex
      // metacharacters and no `\1` / `\&` interpolation in the
      // replacement, keeping it byte-equal with Go's `bf_replace`. The
      // regex-pattern form is refused upstream at the parser.
      const recv = emit(object)
      const oldS = emit(args[0])
      const newS = emit(args[1])
      return `bf.replace(${recv}, ${oldS}, ${newS})`
    }
    case 'replaceAll': {
      // `.replaceAll(old, new)` — string-pattern form, EVERY occurrence,
      // via the dedicated `bf.replace_all` helper (NOT Ruby's `gsub`,
      // which interprets `\1` / `\&` backreference syntax in the
      // replacement even for a literal string pattern — that would
      // diverge from `.replace`'s literal splice above). The
      // regex-pattern form is refused upstream at the parser, same as
      // `.replace`. See #2182.
      const recv = emit(object)
      const oldS = emit(args[0])
      const newS = emit(args[1])
      return `bf.replace_all(${recv}, ${oldS}, ${newS})`
    }
    case 'repeat': {
      // `.repeat(n)` — string repeated `n` times. The `bf.repeat` helper
      // wraps Ruby's `*` string-repeat operator with the same
      // negative-count → "" clamp and integer truncation Go's `bf_repeat`
      // applies, so the two adapters stay byte-equal. Full JS arity: the
      // no-argument form is `repeat(0)` → ""; a second+ argument is
      // ignored.
      const recv = emit(object)
      const count = args.length === 0 ? '0' : emit(args[0])
      return `bf.repeat(${recv}, ${count})`
    }
    case 'padStart':
    case 'padEnd': {
      // `.padStart(target, pad?)` / `.padEnd(target, pad?)`. The
      // `bf.pad_*` helpers default the pad to a single space when the arg
      // is omitted and measure length in characters, matching Go's
      // rune-based `bf_pad_*`. Full JS arity: the no-argument form is
      // `padStart(0)` → the receiver unchanged; a third+ argument is
      // ignored.
      const fn = method === 'padStart' ? 'pad_start' : 'pad_end'
      const recv = emit(object)
      if (args.length === 0) {
        return `bf.${fn}(${recv}, 0)`
      }
      const target = emit(args[0])
      if (args.length === 1) {
        return `bf.${fn}(${recv}, ${target})`
      }
      const pad = emit(args[1])
      return `bf.${fn}(${recv}, ${target}, ${pad})`
    }
    default: {
      // TS-level exhaustiveness guard. If this throws at runtime, the
      // IR was constructed against a newer `ArrayMethod` variant that
      // this adapter hasn't been updated for — loud failure is better
      // than emitting a silent empty string downstream.
      const _exhaustive: never = method
      throw new Error(
        `renderArrayMethod: unhandled ArrayMethod '${(_exhaustive as string)}'`,
      )
    }
  }
}

/**
 * Build the `base_env` Hash-literal argument for an evaluator call: the
 * comparator / reducer body's free variables (body idents minus the
 * callback params), each materialised to its SSR value via `emit`, under a
 * SYMBOL key (the Ruby evaluator's env is symbol-keyed — see
 * `Evaluator.evaluate`'s `identifier` arm). An empty capture set yields
 * `{}` — the runtime's seed-once env.
 */
function emitEvalEnvArg(
  body: ParsedExpr,
  params: string[],
  emit: (e: ParsedExpr) => string,
): string {
  const free = freeVarsInBody(body, new Set(params))
  if (free.length === 0) return '{}'
  const pairs = free.map(
    n => `${rubySymbolKey(n)} ${emit({ kind: 'identifier', name: n })}`,
  )
  return `{ ${pairs.join(', ')} }`
}

/**
 * Emit a `.sort(cmp)` / `.toSorted(cmp)` via the runtime evaluator: the
 * comparator body travels as serialized-ParsedExpr JSON, evaluated per
 * comparison against `{paramA, paramB, …captured}`. Returns null when the
 * body can't be evaluated (e.g. a `localeCompare` comparator —
 * `serializeParsedExpr` refuses it), so the caller falls back to the
 * structured `bf.sort`. A `||`-chained multi-key comparator needs no
 * special handling — JS `0 || next` is exactly the tie-break semantics.
 */
export function renderSortEval(
  recv: string,
  body: ParsedExpr,
  params: string[],
  emit: (e: ParsedExpr) => string,
): string | null {
  if (params.length < 2) return null
  const [paramA, paramB] = params
  const json = serializeParsedExpr(body)
  if (json === null) return null
  const env = emitEvalEnvArg(body, [paramA, paramB], emit)
  return `bf.sort_eval(${recv}, '${escapeRubySingleQuoted(json)}', '${paramA}', '${paramB}', ${env})`
}

/**
 * Emit a `.reduce(fn, init)` / `.reduceRight(fn, init)` via the runtime
 * evaluator: the reducer body travels as serialized-ParsedExpr JSON, folded
 * over the receiver from `init` in `direction` order. Returns null when the
 * body can't be evaluated (→ caller falls back to BF101). A numeric seed
 * passes through as a bare Ruby number; a concat seed as a single-quoted
 * string.
 */
export function renderReduceEval(
  recv: string,
  body: ParsedExpr,
  params: string[],
  init: ParsedExpr,
  direction: 'left' | 'right',
  emit: (e: ParsedExpr) => string,
): string | null {
  if (params.length < 2) return null
  const [paramAcc, paramItem] = params
  const json = serializeParsedExpr(body)
  if (json === null) return null
  // Only literal seeds round-trip to a Ruby scalar here: a string literal
  // as a single-quoted Ruby string, a number literal as a bare numeric.
  // Anything else (an expression seed, an omitted seed) can't be
  // materialised → null, and the caller records BF101.
  let initRuby: string
  if (init.kind === 'literal' && init.literalType === 'string') {
    initRuby = `'${escapeRubySingleQuoted(String(init.value))}'`
  } else if (init.kind === 'literal' && init.literalType === 'number') {
    initRuby = String(init.value)
  } else {
    return null
  }
  const env = emitEvalEnvArg(body, [paramAcc, paramItem], emit)
  return `bf.reduce_eval(${recv}, '${escapeRubySingleQuoted(json)}', '${paramAcc}', '${paramItem}', ${initRuby}, '${direction}', ${env})`
}

/**
 * Emit a higher-order predicate call via the runtime evaluator:
 * `bf.filter_eval` / `bf.every_eval` / `bf.some_eval` / `bf.find_eval` /
 * `bf.find_index_eval`, carrying the serialized predicate body + captured
 * env Hash. Generalizes the inline predicate lowering to the same
 * JS-faithful evaluator the Go adapter uses (cross-adapter isomorphism).
 * Returns null when the predicate is outside the evaluator surface (e.g. a
 * method-call predicate — `serializeParsedExpr` refuses it), so the caller
 * falls back to the inline form. `forward` (find / findIndex family only)
 * selects the search direction — `false` = findLast / findLastIndex.
 */
export function renderPredicateEval(
  funcName: string,
  recv: string,
  predicate: ParsedExpr,
  param: string,
  emit: (e: ParsedExpr) => string,
  forward?: boolean,
): string | null {
  const json = serializeParsedExpr(predicate)
  if (json === null) return null
  const env = emitEvalEnvArg(predicate, [param], emit)
  const fwd = forward === undefined ? '' : `, ${forward ? 'true' : 'false'}`
  return `bf.${funcName}(${recv}, '${escapeRubySingleQuoted(json)}', '${param}'${fwd}, ${env})`
}

/**
 * Emit a `.flatMap(proj)` via the runtime evaluator: the projection `body`
 * serializes to JSON and `bf.flat_map_eval` projects + flattens one level.
 * Returns null when the projection is outside the evaluator surface, and
 * the caller records BF101.
 */
export function renderFlatMapEval(
  recv: string,
  body: ParsedExpr,
  param: string,
  emit: (e: ParsedExpr) => string,
): string | null {
  const json = serializeParsedExpr(body)
  if (json === null) return null
  const env = emitEvalEnvArg(body, [param], emit)
  return `bf.flat_map_eval(${recv}, '${escapeRubySingleQuoted(json)}', '${param}', ${env})`
}

/**
 * Emit a value-producing `.map(cb)` via the runtime evaluator: the
 * projection `body` serializes to JSON and `bf.map_eval` projects each
 * element, one result per element (no flatten — the JS `.map` contract).
 * Composes through the array-method chain (`.map(cb).join(' ')`). Returns
 * null when the projection is outside the evaluator surface, and the caller
 * records BF101. The JSX-returning `.map` is an IRLoop upstream and never
 * reaches this emit.
 */
export function renderMapEval(
  recv: string,
  body: ParsedExpr,
  param: string,
  emit: (e: ParsedExpr) => string,
): string | null {
  const json = serializeParsedExpr(body)
  if (json === null) return null
  const env = emitEvalEnvArg(body, [param], emit)
  return `bf.map_eval(${recv}, '${escapeRubySingleQuoted(json)}', '${param}', ${env})`
}

/**
 * Shared ERB emit for `.sort(cmp)` / `.toSorted(cmp)`. Used by both the
 * filter-context emitter and the top-level emitter, plus the loop-hoist path
 * in `renderLoop` — same emit shape across all three so a regression in any
 * one path surfaces consistently.
 *
 * The Ruby helper accepts an opts Hash whose `keys:` entry is an ordered
 * list of per-key Hashes (room for a future `nulls` knob without arity
 * churn), and returns a fresh Array so downstream composition
 * (`bf.sort(...).join(...)`, etc.) stays straightforward.
 */
export function renderSortMethod(recv: string, c: SortComparator): string {
  // One Hash per comparison key, in priority order, under `keys:`. A
  // simple comparator yields a one-element list; a `||`-chained multi-key
  // comparator yields one per operand. `bf.sort` walks them in order,
  // falling through to the next on a tie.
  const keyHashes = c.keys.map((k) => {
    const keyEntry =
      k.key.kind === 'self'
        ? `key_kind: 'self'`
        : `key_kind: 'field', key: '${k.key.field}'`
    return `{ ${keyEntry}, compare_type: '${k.type}', direction: '${k.direction}' }`
  })
  return `bf.sort(${recv}, { keys: [${keyHashes.join(', ')}] })`
}

// `.flat(depth?)` → `bf.flat(recv, depth)`. The `Infinity` form lowers
// to the `-1` sentinel (flatten fully); a finite depth flattens that many
// levels (`0` = shallow copy).
export function renderFlatMethod(
  recv: string,
  depth: FlatDepth | { expr: ParsedExpr },
  emit: (e: ParsedExpr) => string,
): string {
  if (typeof depth === 'object') {
    // Dynamic depth (#2094): routed to a SEPARATE runtime helper
    // (`bf.flat_dynamic`), not `bf.flat` — `bf.flat`'s `depth` parameter
    // treats `-1` as a compile-time SENTINEL meaning "the source literally
    // wrote `Infinity`" (the parser's own normalisation of a literal
    // depth). A genuinely dynamic depth value that happens to evaluate to
    // `-1` at render time means the JS-correct OPPOSITE: `.flat(-1)` never
    // recurses (same as `.flat(0)`, a shallow copy). Since both paths would
    // otherwise hand the same literal-looking argument to one shared
    // function, that function couldn't tell which case it's in — so
    // `bf.flat_dynamic` coerces the raw value via JS `ToIntegerOrInfinity`
    // FIRST (truncate toward zero; negative → 0; NaN/non-numeric → 0;
    // +Infinity or a huge finite value → flatten fully) and only then
    // delegates to the same recursion `bf.flat` uses. Mirrors the Go
    // adapter's `bf_flat_dynamic` (go-template-adapter.ts) and runtime
    // `FlatDynamicDepth`/`coerceFlatDepth` (adapter-go-template/runtime/bf.go).
    return `bf.flat_dynamic(${recv}, ${emit(depth.expr)})`
  }
  const d = depth === 'infinity' ? -1 : depth
  return `bf.flat(${recv}, ${d})`
}
