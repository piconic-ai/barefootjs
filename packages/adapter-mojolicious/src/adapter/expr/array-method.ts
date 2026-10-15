/**
 * Array / string method lowering for the Mojolicious EP template adapter.
 *
 * Extracted from `mojo-adapter.ts` (domain-module refactor, issue #2018
 * track D). Pure free functions shared by both the filter-context emitter
 * and the top-level emitter — they take an `emit` callback for receiver /
 * argument recursion and read no adapter instance state.
 */

import {
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
  CallbackEvalSpelling,
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
 * How this adapter spells a runtime-evaluator call. What to call, with which
 * operands and captured names, is decided by `@barefootjs/jsx`'s
 * `adapters/callback-method.ts`.
 */
export const EVAL_SPELLING: CallbackEvalSpelling = {
  call: (helper, operands) => `bf->${helper}(${operands.join(', ')})`,
  string: (value) => `'${escapePerlSingleQuote(value)}'`,
  boolean: (value) => (value ? '1' : '0'),
  env: (entries) =>
    entries.length === 0 ? '{}' : `{ ${entries.map(([name, value]) => `'${escapePerlSingleQuote(name)}' => ${value}`).join(', ')} }`,
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
