/**
 * Array / string method lowering for the Mojolicious EP template adapter.
 *
 * Extracted from `mojo-adapter.ts` (domain-module refactor, issue #2018
 * track D). Pure free functions shared by both the filter-context emitter
 * and the top-level emitter — they take an `emit` callback for receiver /
 * argument recursion and read no adapter instance state.
 */

import {
  serializeParsedExpr,
  freeVarsInBody,
  emitArrayMethod,
  lowerArrayMethod,
  prefixedArrayMethodSpelling,
} from '@barefootjs/jsx'
import type {
  ParsedExpr,
  ArrayMethod,
  SortComparator,
  FlatDepth,
  ArrayMethodSpelling,
} from '@barefootjs/jsx'

const helperCall = prefixedArrayMethodSpelling('bf->', 'undef')

// The undefined literal is the `slice` end the source left out; Perl reads `undef`.
// Perl's native `lc` / `uc` need no runtime helper.
const ARRAY_METHOD_SPELLING: ArrayMethodSpelling = {
  ...helperCall,
  call: (helper, operands) =>
    helper === 'lc'
      ? `lc(${operands[0]})`
      : helper === 'uc'
        ? `uc(${operands[0]})`
        : helperCall.call(helper, operands),
}

/**
 * Lower `object.method(...args)` through the shared catalogue
 * (`@barefootjs/jsx`'s `adapters/array-method.ts`). This adapter only spells
 * the helper call.
 */
export function renderArrayMethod(
  method: ArrayMethod,
  object: ParsedExpr,
  args: ParsedExpr[],
  emit: (e: ParsedExpr) => string,
): string {
  return emitArrayMethod(lowerArrayMethod(method, object, args), emit, ARRAY_METHOD_SPELLING)
}

/** Escape a string for embedding in a Perl single-quoted literal. */
function escapePerlSingleQuote(s: string): string {
  // Double every backslash and escape apostrophes: Perl single-quote
  // un-escaping then restores the original bytes (a JSON `\\` must reach
  // `JSON::PP->decode` as `\\`, so it travels as `\\\\` in the literal).
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

/**
 * Build the `base_env` hashref argument for an evaluator call: the
 * comparator / reducer body's free variables (body idents minus the
 * callback params), each materialised to its SSR value via `emit`. An
 * empty capture set yields `{}` — the runtime's seed-once env.
 */
function emitEvalEnvArg(
  body: ParsedExpr,
  params: string[],
  emit: (e: ParsedExpr) => string,
): string {
  const free = freeVarsInBody(body, new Set(params))
  if (free.length === 0) return '{}'
  const pairs = free.map(
    n => `'${escapePerlSingleQuote(n)}' => ${emit({ kind: 'identifier', name: n })}`,
  )
  return `{ ${pairs.join(', ')} }`
}

/**
 * Emit a `.sort(cmp)` / `.toSorted(cmp)` via the runtime evaluator (#2018):
 * the comparator body travels as serialized-ParsedExpr JSON, evaluated per
 * comparison against `{paramA, paramB, …captured}`. Returns null when the
 * body can't be evaluated (e.g. a `localeCompare` comparator —
 * `serializeParsedExpr` refuses it), so the caller falls back to the
 * structured `bf->sort`. A `||`-chained multi-key comparator needs no
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
  return `bf->sort_eval(${recv}, '${escapePerlSingleQuote(json)}', '${paramA}', '${paramB}', ${env})`
}

/**
 * Emit a `.reduce(fn, init)` / `.reduceRight(fn, init)` via the runtime
 * evaluator (#2018): the reducer body travels as serialized-ParsedExpr JSON,
 * folded over the receiver from `init` in `direction` order. Returns null when
 * the body can't be evaluated (→ caller falls back to `bf->reduce`). A numeric
 * seed passes through as a bare Perl number; a concat seed as a single-quoted
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
  // Only literal seeds round-trip to a Perl scalar here: a string literal as a
  // single-quoted Perl string, a number literal as a bare numeric. Anything
  // else (an expression seed, an omitted seed) can't be materialised → null,
  // and the caller records BF101.
  let initPerl: string
  if (init.kind === 'literal' && init.literalType === 'string') {
    initPerl = `'${escapePerlSingleQuote(String(init.value))}'`
  } else if (init.kind === 'literal' && init.literalType === 'number') {
    initPerl = String(init.value)
  } else {
    return null
  }
  const env = emitEvalEnvArg(body, [paramAcc, paramItem], emit)
  return `bf->reduce_eval(${recv}, '${escapePerlSingleQuote(json)}', '${paramAcc}', '${paramItem}', ${initPerl}, '${direction}', ${env})`
}

/**
 * Emit a higher-order predicate call via the runtime evaluator (#2018, P2):
 * `bf->filter_eval` / `bf->every_eval` / `bf->some_eval` / `bf->find_eval` /
 * `bf->find_index_eval`, carrying the serialized predicate body + captured env
 * hashref. Generalizes the inline `grep` / `bf->find` lowering to the same
 * JS-faithful evaluator the Go adapter uses (cross-adapter isomorphism).
 * Returns null when the predicate is outside the evaluator surface (e.g. a
 * method-call predicate — `serializeParsedExpr` refuses it), so the caller
 * falls back to the `grep` / `bf->find` form. `forward` (find / findIndex
 * family only) selects the search direction — `false` = findLast /
 * findLastIndex.
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
  const fwd = forward === undefined ? '' : `, ${forward ? 1 : 0}`
  return `bf->${funcName}(${recv}, '${escapePerlSingleQuote(json)}', '${param}'${fwd}, ${env})`
}

/**
 * Emit a `.flatMap(proj)` via the runtime evaluator (#2018, P3/P5): the
 * projection `body` serializes to JSON and `bf->flat_map_eval` projects +
 * flattens one level. The sole flatMap lowering now (the structured
 * `bf->flat_map` / `bf->flat_map_tuple` fallback was retired with the
 * `ParsedExpr` collapse); returns null when the projection is outside the
 * evaluator surface, and the caller records BF101.
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
  return `bf->flat_map_eval(${recv}, '${escapePerlSingleQuote(json)}', '${param}', ${env})`
}

/**
 * Emit a value-producing `.map(cb)` via the runtime evaluator (#2073): the
 * projection `body` serializes to JSON and `bf->map_eval` projects each
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
  return `bf->map_eval(${recv}, '${escapePerlSingleQuote(json)}', '${param}', ${env})`
}

/**
 * Shared Mojo emit for `.sort(cmp)` / `.toSorted(cmp)` (#1448 Tier B).
 * Used by both the filter-context emitter and the top-level emitter,
 * plus the loop-hoist path in `renderLoop` — same emit shape across
 * all three so a regression in any one path surfaces consistently.
 *
 * The Perl helper accepts a hash-ref opts bag whose `keys` entry is
 * an ordered list of per-key hashes (room for a future `nulls` knob
 * without arity churn), and returns a fresh ARRAY ref so downstream
 * composition (`@{bf->sort(...)}` in `join(...)`, etc.) stays
 * straightforward.
 */
export function renderSortMethod(recv: string, c: SortComparator): string {
  // One hash per comparison key, in priority order, under `keys`. A
  // simple comparator yields a one-element list; a `||`-chained
  // multi-key comparator yields one per operand. `bf->sort` walks them
  // in order, falling through to the next on a tie.
  const keyHashes = c.keys.map((k) => {
    const keyEntry =
      k.key.kind === 'self'
        ? `key_kind => 'self'`
        : `key_kind => 'field', key => '${k.key.field}'`
    return `{ ${keyEntry}, compare_type => '${k.type}', direction => '${k.direction}' }`
  })
  return `bf->sort(${recv}, { keys => [${keyHashes.join(', ')}] })`
}

// `.flat(depth?)` → `bf->flat($recv, $depth)`. The `Infinity` form lowers
// to the `-1` sentinel (flatten fully); a finite depth flattens that many
// levels (`0` = shallow copy). See `sub flat` in BarefootJS.pm. (#1448)
export function renderFlatMethod(
  recv: string,
  depth: FlatDepth | { expr: ParsedExpr },
  emit: (e: ParsedExpr) => string,
): string {
  if (typeof depth === 'object') {
    // Dynamic depth (#2094): routed to a SEPARATE runtime helper
    // (`bf->flat_dynamic`), not `bf->flat`. The literal-depth path below
    // already uses `-1` as a compile-time SENTINEL baked into the template
    // source meaning "the source literally said `Infinity`". A genuinely
    // dynamic depth that happens to evaluate to `-1` at render time means
    // the OPPOSITE in real JS (`[1,[2]].flat(-1)` never recurses — same as
    // `.flat(0)`). Since both paths would otherwise hand the same
    // literal-looking argument to one shared helper, that helper couldn't
    // tell which case it's in — so `flat_dynamic` performs its own
    // `ToIntegerOrInfinity`-style coercion (truncate toward zero; negative
    // -> 0; NaN/non-numeric -> 0; +Infinity or a huge finite value ->
    // flatten fully) and then delegates to `flat`. See `sub flat_dynamic`
    // in BarefootJS.pm and the Go reference (`FlatDynamicDepth`/
    // `coerceFlatDepth` in bf.go).
    return `bf->flat_dynamic(${recv}, ${emit(depth.expr)})`
  }
  const d = depth === 'infinity' ? -1 : depth
  return `bf->flat(${recv}, ${d})`
}
