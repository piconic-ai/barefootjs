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
import { rubySymbolKey, escapeRubySingleQuoted } from '../lib/ruby-naming.ts'

const helperCall = prefixedArrayMethodSpelling('bf.', 'nil')

// The undefined literal is the `slice` end the source left out; Ruby reads `nil`.
// Ruby's native `.downcase` / `.upcase` need no runtime helper.
const ARRAY_METHOD_SPELLING: ArrayMethodSpelling = {
  ...helperCall,
  call: (helper, operands) =>
    helper === 'lc'
      ? `(${operands[0]}).downcase`
      : helper === 'uc'
        ? `(${operands[0]}).upcase`
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

/**
 * How this adapter spells a runtime-evaluator call. What to call, with which
 * operands and captured names, is decided by `@barefootjs/jsx`'s
 * `adapters/callback-method.ts`.
 */
export const EVAL_SPELLING: CallbackEvalSpelling = {
  call: (helper, operands) => `bf.${helper}(${operands.join(', ')})`,
  string: (value) => `'${escapeRubySingleQuoted(value)}'`,
  boolean: (value) => (value ? 'true' : 'false'),
  env: (entries) =>
    entries.length === 0 ? '{}' : `{ ${entries.map(([name, value]) => `${rubySymbolKey(name)} ${value}`).join(', ')} }`,
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
