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
 * What the row variable `item` holds: a scalar row (`string[]`, whose
 * `item` IS the value) or a struct row. `hasFieldPath`, when given, says
 * whether a field path exists on the struct row's Go type, so a read
 * through a field the struct doesn't carry (`item.label.length`) declines
 * instead of emitting Go that won't compile. `readGoType`, when given,
 * answers the Go type of a row read at `segments` (`[]` is the whole row),
 * or null when it can't tell — what a caller assigning the read into
 * another struct's field checks assignability against.
 */
export interface LoopRowShape {
  scalar?: boolean
  hasFieldPath?: (segments: readonly LoopBindingPathSegment[]) => boolean
  readGoType?: (segments: readonly LoopBindingPathSegment[]) => string | null
}

/**
 * Go expression reading `expr` off the source row variable `item`: the
 * whole row (`i` → `item`), or a field path off a struct row
 * (`item.meta.id` → `item.Meta.ID`). Null when `expr` isn't a plain row
 * read, reads a field off a scalar row, or names a field path the row's Go
 * type doesn't have.
 */
export function rowReadGoAccessor(expr: ParsedExpr, row: LoopRowBinding, shape: LoopRowShape = {}): string | null {
  const path = rowItemPath(expr, row)
  if (!path) return null
  if (path.length === 0) return 'item'
  if (shape.scalar) return null
  if (shape.hasFieldPath && !shape.hasFieldPath(path)) return null
  return goItemAccessor(path)
}

/**
 * The one answer to "what Go expression is this keyed loop's `key`,
 * evaluated against the SOURCE row `item`?" — the datum the `.map()`
 * callback receives, never a child component's `Input` built from it
 * (`item.id` → `item.ID`, `({ id }) => … key={id}` → `item.ID`, a scalar
 * row's `key={i}` → `item`). Null for a key that is not a row read: a
 * computed expression, or the whole row of a struct row (`key={item}`,
 * which JS stringifies as `[object Object]`) — the caller then skips
 * `data-key` rather than emit something that won't compile.
 */
export function loopKeyToGoRowExpr(key: string | undefined, row: LoopRowBinding, shape: LoopRowShape = {}): string | null {
  if (!key) return null
  const accessor = rowReadGoAccessor(parseExpression(key), row, shape)
  if (accessor === 'item' && !shape.scalar) return null
  return accessor
}
