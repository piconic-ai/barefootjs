/**
 * Loop-row reads → Go field paths, one answer for every site that asks
 * "does this expression read the loop row, and through which fields?"
 * (#3313). A row is read either through a plain callback param
 * (`o => o.tone`) or through a destructured binding
 * (`({ tone }) => tone`, whose structured `segments` already spell the
 * path from the row to the binding). Both resolve to the same segment
 * path, so the constructor's `data-key`, the row wrappers and the test
 * harness's handler stand-in agree on `item.Tone`.
 */

import { parseExpression, type LoopBindingPathSegment, type LoopParamBinding, type ParsedExpr } from '@barefootjs/jsx'
import { capitalizeFieldName } from './go-naming.ts'

/** The loop callback's row binding: a plain `param`, or a destructure (`paramBindings`, which wins when non-empty). */
export interface LoopRowBinding {
  param?: string
  paramBindings?: readonly LoopParamBinding[]
}

/**
 * Path from the loop row to the value `expr` reads, or null when `expr`
 * is not a (non-computed, non-optional) read of the row. The bare plain
 * param resolves to `[]`; a destructured binding to its own `segments`
 * (a rest binding is not a fixed path and resolves to null).
 */
export function rowItemPath(expr: ParsedExpr, row: LoopRowBinding): LoopBindingPathSegment[] | null {
  if (expr.kind === 'identifier') {
    if (row.paramBindings && row.paramBindings.length > 0) {
      const binding = row.paramBindings.find(b => b.name === expr.name && !b.rest)
      return binding?.segments ? [...binding.segments] : null
    }
    return row.param !== undefined && expr.name === row.param ? [] : null
  }
  if (expr.kind === 'member' && !expr.computed && !expr.optional) {
    const base = rowItemPath(expr.object, row)
    return base ? [...base, { kind: 'field', key: expr.property, isIdent: true }] : null
  }
  return null
}

/**
 * Go expression reading `segments` off the row variable `base`
 * (`item.Tone`), or null when a segment has no Go field spelling (an
 * array index or a non-identifier key).
 */
export function goItemAccessor(segments: readonly LoopBindingPathSegment[], base = 'item'): string | null {
  let accessor = base
  for (const segment of segments) {
    if (segment.kind !== 'field' || !segment.isIdent) return null
    accessor += `.${capitalizeFieldName(segment.key)}`
  }
  return accessor
}

/**
 * Lower a keyed loop's `key` to the Go field path on the row variable
 * `item` (`item.label` → `item.Label`, `({ id }) => … key={id}` →
 * `item.ID`). Null for a key that is not a field of the row: a computed
 * expression, or the whole row (`key={item}`) — the caller then skips
 * `data-key` rather than emit something that won't compile.
 */
export function loopKeyToGoFieldPath(key: string | undefined, row: LoopRowBinding): string | null {
  if (!key) return null
  const path = rowItemPath(parseExpression(key), row)
  if (!path || path.length === 0) return null
  return goItemAccessor(path)
}
