/**
 * Shared "wrap item → decide lazy → wrap index" core for a plain loop row.
 *
 * `buildPlainLoopPlan` (`build-loop.ts`, `TopLevelLoop`) and
 * `buildBranchLoopPlan` (`build-branch-loop.ts`, `BranchLoop`) both build a
 * row from a `.map()` callback the SAME way:
 *
 *   1. Wrap the row's JS with ITEM-ONLY accessor rewriting (no index) — this
 *      string must stay index-unwrapped because it is reused VERBATIM by the
 *      lazy row plan below, which reads the index differently (a live
 *      per-call value off `entry.index`/`createRow`'s parameter, never a
 *      `.map()`-body call).
 *   2. Ask `buildLazyRowPlan` for a verdict.
 *   3. Only once lazy is ruled out (`!lazyRow`), wrap index references too,
 *      for the eager path — `mapArrayLazy`'s `createRow` hands a row a plain
 *      index NUMBER, so wrapping unconditionally would call a number.
 *
 * Before this extraction, the sequence was duplicated verbatim (mod `elem`/`loop` naming)
 * between the two builders — exactly the "one decision, two implementations"
 * pattern this repo's CLAUDE.md warns against, and the shape of the original
 * #2859 CI regression (the eager index-wrap leaking into the lazy-shared
 * string). One implementation now, called from both sites, so the decision
 * cannot silently diverge again.
 */

import type { BranchLoop, TopLevelLoop } from '../../types.ts'
import { wrapLoopParamAsAccessor, wrapIndexParamAsAccessor } from '../../utils.ts'
import { destructureLoopParam, buildPreambleRegionPlans } from '../shared.ts'
import { renderPreamble, irToHtmlTemplate } from '../../html-template.ts'
import { buildLazyRowPlan, type LazyRowPlanData } from './build-lazy-row.ts'
import type { LazyRowScopeInfo } from './lazy-row-eligibility.ts'
import type { PreambleRegionPlan } from './loop.ts'

export interface PlainRowInputs {
  loop: TopLevelLoop | BranchLoop
  /** Fully-chained array expression as the CALLER emits it (branch-loop's flatMap form differs from plain's). */
  arrayExpr: string
  callSite: 'plain' | 'branch-plain'
  flatMapLeafItem: boolean
  anchored: boolean
  scope: LazyRowScopeInfo | undefined
}

export interface PlainRowCore {
  indexParam: string
  paramHead: string
  paramUnwrap: string
  preambleRegions: readonly PreambleRegionPlan[]
  lazyRow: LazyRowPlanData | undefined
  /** Item-wrapped, and index-wrapped too IFF the row is NOT lazy-eligible. */
  mapPreambleWrapped: string
  /** Same rule as `mapPreambleWrapped`, applied to `loop.template`. */
  template: string
  /** Item-only wrap — exposed for the few expressions (e.g. `anchorKeyExpr`) built outside this core. */
  wrapItem: (expr: string) => string
}

export function buildPlainRowCore(inputs: PlainRowInputs): PlainRowCore {
  const { loop, arrayExpr, callSite, flatMapLeafItem, anchored, scope } = inputs

  const wrapItem = (expr: string) => wrapLoopParamAsAccessor(expr, loop.param, loop.paramBindings)
  const { head: paramHead, unwrap: paramUnwrap } = destructureLoopParam(loop.param, loop.paramBindings)
  const indexParam = loop.index || '__idx'

  const mapPreambleWrapped = loop.preamble
    ? renderPreamble(loop.preamble, {
        transformJs: wrapItem,
        renderLeaf: (ir) => irToHtmlTemplate(ir, undefined, 1, [{ param: loop.param, bindings: loop.paramBindings }], undefined),
      })
    : ''
  const preambleRegions = buildPreambleRegionPlans(loop.preambleRegions, loop.param, loop.paramBindings, loop.index)

  // Lazy row graph (§9, L3). `undefined` for every ineligible loop, which
  // then keeps the eager emission below byte-for-byte. Decided from the
  // item-only-wrapped `mapPreambleWrapped` above — eligibility itself reads
  // `loop.preamble` (raw), not this string, so which wrap it carries doesn't
  // change the verdict.
  const lazyRow = buildLazyRowPlan({
    loop,
    arrayExpr,
    indexParam,
    paramUnwrap,
    mapPreambleWrapped,
    preambleRegionCount: preambleRegions.length,
    callSite,
    flatMapLeafItem,
    anchored,
    scope,
  }) ?? undefined

  // Only once lazy is ruled out is it safe to ALSO wrap index references
  // (#2859 follow-up) — see the module docstring.
  const mapPreambleWrappedFinal = !lazyRow && loop.index
    ? wrapIndexParamAsAccessor(mapPreambleWrapped, loop.index)
    : mapPreambleWrapped
  // `loop.templateIndexed` is a second structured render (index wrapped at
  // IR time, `collect-elements.ts`) rather than a post-hoc regex pass over
  // `loop.template` — a word-boundary regex over assembled HTML can match a
  // bare tag name colliding with the index identifier (`<i>` -> `<i()>`,
  // #2868). Falls back to `loop.template` for the rare shape that doesn't
  // populate it (e.g. a flatMap projection loop).
  const templateFinal = !lazyRow && loop.index
    ? (loop.templateIndexed ?? loop.template)
    : loop.template

  return {
    indexParam,
    paramHead,
    paramUnwrap,
    preambleRegions,
    lazyRow,
    mapPreambleWrapped: mapPreambleWrappedFinal,
    template: templateFinal,
    wrapItem,
  }
}
