/**
 * Array / string method lowering for the minijinja template adapter.
 *
 * Ported from `packages/adapter-xslate/src/adapter/expr/array-method.ts`.
 * Pure free functions shared by both the filter-context emitter and the
 * top-level emitter — they take an `emit` callback for receiver / argument
 * recursion and read no adapter instance state.
 *
 * The receiver/array helpers are the same runtime methods the Xslate adapter
 * calls, invoked as `bf.NAME(...)` (bare, no `$` sigil) instead of
 * `$bf.NAME(...)`.
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
import { escapeMinijinjaSingleQuoted, minijinjaHashKey } from '../lib/minijinja-naming.ts'

// The undefined literal is the `slice` end the source left out; MiniJinja reads `none`.
const ARRAY_METHOD_SPELLING = prefixedArrayMethodSpelling('bf.', 'none')

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
  string: (value) => `'${escapeMinijinjaSingleQuoted(value)}'`,
  boolean: (value) => (value ? 'true' : 'false'),
  env: (entries) =>
    `{${entries.map(([name, value]) => `${minijinjaHashKey(name)}: ${value}`).join(', ')}}`,
}

/**
 * Shared Jinja emit for `.sort(cmp)` / `.toSorted(cmp)`. Used by both the
 * filter-context emitter and the top-level emitter, plus the loop-array
 * wrap in `renderLoop`. The runtime `bf.sort` accepts an opts dict and
 * returns a fresh list.
 */
export function renderSortMethod(recv: string, c: SortComparator): string {
  const keyDicts = c.keys.map((k) => {
    const keyEntry =
      k.key.kind === 'self'
        ? `'key_kind': 'self'`
        : `'key_kind': 'field', 'key': '${k.key.field}'`
    return `{${keyEntry}, 'compare_type': '${k.type}', 'direction': '${k.direction}'}`
  })
  return `bf.sort(${recv}, {'keys': [${keyDicts.join(', ')}]})`
}

// `.flat(depth?)` → `bf.flat(recv, depth)`.
export function renderFlatMethod(
  recv: string,
  depth: FlatDepth | { expr: ParsedExpr },
  emit: (e: ParsedExpr) => string,
): string {
  if (typeof depth === 'object') {
    // Dynamic depth (#2094): routed to a DISTINCT runtime entry point,
    // `bf.flat_dynamic`, rather than reusing `bf.flat`. `bf.flat`'s `depth`
    // is a compile-time int baked directly into the template source, where
    // `-1` is a SENTINEL meaning "the source literally wrote `Infinity`".
    // A genuinely dynamic depth value that happens to evaluate to `-1` at
    // render time means the OPPOSITE in real JS (`[1,[2]].flat(-1)` never
    // recurses — same as `.flat(0)`). Since both call sites would otherwise
    // hand the same literal-looking argument to one shared function, that
    // function couldn't tell which case it's in — so it's two functions.
    // `bf.flat_dynamic` coerces its depth argument at RENDER time via JS
    // `ToIntegerOrInfinity` (truncate toward zero; negative → 0; NaN → 0;
    // +Infinity / a huge finite value → flatten fully) and delegates to the
    // same underlying flatten routine as `bf.flat`.
    return `bf.flat_dynamic(${recv}, ${emit(depth.expr)})`
  }
  const d = depth === 'infinity' ? -1 : depth
  return `bf.flat(${recv}, ${d})`
}
