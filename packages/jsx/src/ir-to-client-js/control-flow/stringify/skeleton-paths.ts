/**
 * Turn compile-time `SkeletonSlotPaths` (html-template.ts) into the `__p`
 * array-literal contents plus slot -> index maps consumed by
 * `stringifyPlainLoop` / `stringifyReactiveEffects` / `emitLoopChildRefs`
 * (perf: direct child-index paths for hoisted single-root loops, #2143).
 *
 * Single source of truth for `__p` ordering: `loop.ts` (which emits the
 * array literal) and `reactive-effects.ts` (which emits the per-slot index
 * reads) both derive their indices from the SAME `SkeletonPathPlan`, so the
 * two can never drift out of sync.
 */

import type { SkeletonSlotPaths } from '../../html-template.ts'

/**
 * Convert a root-relative child-index path into a `.firstChild.nextSibling…`
 * property chain off `base`. An empty path resolves to `base` itself (the
 * slot lives on the clone root, e.g. an attr on the loop body's own tag).
 */
export function pathExpr(base: string, path: readonly number[]): string {
  let expr = base
  for (const idx of path) {
    expr += '.firstChild'
    if (idx > 0) expr += '.nextSibling'.repeat(idx)
  }
  return expr
}

export interface SkeletonPathPlan {
  /** Expressions for the `const __p = [...]` array literal, in stable order. */
  arrayElems: string[]
  /** slotId -> index into `__p`, for element-anchored slots (reactive attrs, refs). */
  elementIndexBySlot: Map<string, number>
  /** slotId -> index into `__p`, for text-marker-anchored slots (reactive texts). */
  textIndexBySlot: Map<string, number>
}

/**
 * Build the `__p` plan for a hoisted loop's reactive attr / text / ref
 * slots. A slotId absent from `skeletonPaths` (shouldn't happen for a
 * successfully-hoisted skeleton, but handled defensively) is simply left
 * out of both maps — its stringifier call site falls back to `qsa`/`$t`
 * for that one slot without affecting any other slot's resolution.
 */
export function buildSkeletonPathPlan(
  skeletonPaths: SkeletonSlotPaths,
  elVar: string,
  opts: { elementSlotIds: readonly string[]; textSlotIds: readonly string[] },
): SkeletonPathPlan {
  const arrayElems: string[] = []
  const elementIndexBySlot = new Map<string, number>()
  const textIndexBySlot = new Map<string, number>()

  for (const slotId of opts.elementSlotIds) {
    if (elementIndexBySlot.has(slotId)) continue
    const path = skeletonPaths.elementPaths.get(slotId)
    if (!path) continue
    elementIndexBySlot.set(slotId, arrayElems.length)
    arrayElems.push(pathExpr(elVar, path))
  }
  for (const slotId of opts.textSlotIds) {
    if (textIndexBySlot.has(slotId)) continue
    const path = skeletonPaths.textMarkerPaths.get(slotId)
    if (!path) continue
    textIndexBySlot.set(slotId, arrayElems.length)
    arrayElems.push(pathExpr(elVar, path))
  }

  return { arrayElems, elementIndexBySlot, textIndexBySlot }
}
