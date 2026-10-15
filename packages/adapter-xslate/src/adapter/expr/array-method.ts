/**
 * Array / string method lowering for the Text::Xslate (Kolon) template adapter.
 *
 * Extracted from `xslate-adapter.ts` (domain-module refactor, issue #2018
 * track D). Pure free functions shared by both the filter-context emitter and
 * the top-level emitter — they take an `emit` callback for receiver / argument
 * recursion and read no adapter instance state.
 *
 * The receiver/array helpers are the same runtime methods the Mojo adapter
 * calls, invoked as `$bf.NAME(...)` on the Kolon `$bf` object instead of
 * `bf->NAME`.
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
  CallbackEvalSpelling,
} from '@barefootjs/jsx'

// The undefined literal is the `slice` end the source left out; Kolon reads `nil`.
const ARRAY_METHOD_SPELLING = prefixedArrayMethodSpelling('$bf.', 'nil')

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
  call: (helper, operands) => `$bf.${helper}(${operands.join(', ')})`,
  string: (value) => `'${escapePerlSingleQuote(value)}'`,
  boolean: (value) => (value ? '1' : '0'),
  env: (entries) =>
    entries.length === 0 ? '{}' : `{ ${entries.map(([name, value]) => `'${escapePerlSingleQuote(name)}' => ${value}`).join(', ')} }`,
}

/**
 * Shared Kolon emit for `.sort(cmp)` / `.toSorted(cmp)`. Used by both the
 * filter-context emitter and the top-level emitter, plus the loop-array
 * wrap in `renderLoop`. The runtime `$bf.sort` accepts a hashref opts bag and
 * returns a fresh array ref.
 */
export function renderSortMethod(recv: string, c: SortComparator): string {
  const keyHashes = c.keys.map((k) => {
    const keyEntry =
      k.key.kind === 'self'
        ? `key_kind => 'self'`
        : `key_kind => 'field', key => '${k.key.field}'`
    return `{ ${keyEntry}, compare_type => '${k.type}', direction => '${k.direction}' }`
  })
  return `$bf.sort(${recv}, { keys => [${keyHashes.join(', ')}] })`
}

// `.flat(depth?)` → `$bf.flat($recv, $depth)`.
export function renderFlatMethod(
  recv: string,
  depth: FlatDepth | { expr: ParsedExpr },
  emit: (e: ParsedExpr) => string,
): string {
  if (typeof depth === 'object') {
    // Dynamic depth (#2094): routed to a SEPARATE runtime helper
    // (`$bf.flat_dynamic`), not `$bf.flat`. The literal-depth path below
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
    return `$bf.flat_dynamic(${recv}, ${emit(depth.expr)})`
  }
  const d = depth === 'infinity' ? -1 : depth
  return `$bf.flat(${recv}, ${d})`
}
