/**
 * Build `CompositeLoopPlan` for top-level (`emitCompositeElementReconciliation`)
 * and branch-scoped (`emitCompositeBranchLoop`) composite loops.
 *
 * The two contexts share the same renderItem body shape — only the container
 * variable, the array expression chaining, and indentation differ. Both
 * variants are produced by the same builder so the stringifier sees one
 * consistent Plan.
 */

import type { TopLevelLoop, BranchLoop, LoopChildConditional } from '../../types'
import type { IRLoopChildComponent } from '../../../types'
import {
  buildChainedArrayExpr,
  varSlotId,
  wrapLoopParamAsAccessor,
} from '../../utils'
import {
  loopKeyFn,
  destructureLoopParam,
  buildDepthLevels,
} from '../shared'
import { buildReactiveEffectsPlan } from './build-reactive-effects'
import { buildInnerLoopsPlan } from './build-inner-loop'
import type { CompositeLoopPlan } from './types'

export function buildTopLevelCompositePlan(elem: TopLevelLoop): CompositeLoopPlan {
  const nestedComps = elem.nestedComponents!
  const depthLevels = buildDepthLevels(elem.innerLoops ?? [], nestedComps, elem.childEvents)
  const { head: paramHead, unwrap: paramUnwrap } = destructureLoopParam(elem.param, elem.paramBindings)
  const wrap = (expr: string) => wrapLoopParamAsAccessor(expr, elem.param, elem.paramBindings)

  const outerCompsByDepth = nestedComps.filter(c => !c.loopDepth || c.loopDepth === 0)

  return {
    kind: 'composite-loop',
    containerVar: `_${varSlotId(elem.slotId)}`,
    arrayExpr: buildChainedArrayExpr(elem),
    keyFn: loopKeyFn(elem),
    paramHead,
    paramUnwrap,
    indexParam: elem.index || '__idx',
    mapPreambleWrapped: elem.mapPreamble ? wrap(elem.mapPreamble) : '',
    template: elem.template,
    outerComps: filterCondCompsOut(outerCompsByDepth, elem.childConditionals),
    outerEvents: elem.childEvents.filter(ev => ev.nestedLoops.length === 0),
    innerLoops: buildInnerLoopsPlan({
      levels: depthLevels,
      parentElVar: '__el',
      outerLoopParam: elem.param,
      outerLoopParamBindings: elem.paramBindings,
    }),
    loopParam: elem.param,
    loopParamBindings: elem.paramBindings,
    reactiveEffects: hasReactive(elem)
      ? buildReactiveEffectsPlan({
          attrs: elem.childReactiveAttrs ?? [],
          texts: elem.childReactiveTexts ?? [],
          conditionals: elem.childConditionals,
          loopParam: elem.param,
          loopParamBindings: elem.paramBindings,
        })
      : null,
    branchClearChildren: false,
    topIndent: '  ',
    bodyIndent: '    ',
  }
}

export function buildBranchCompositePlan(loop: BranchLoop, cv: string): CompositeLoopPlan {
  const nestedComps = loop.nestedComponents!
  const innerLoops = loop.innerLoops ?? []
  const childEvents = loop.childEvents
  const depthLevels = buildDepthLevels(innerLoops, nestedComps, childEvents)
  const { head: paramHead, unwrap: paramUnwrap } = destructureLoopParam(loop.param, loop.paramBindings)
  const wrap = (expr: string) => wrapLoopParamAsAccessor(expr, loop.param, loop.paramBindings)

  const outerCompsByDepth = nestedComps.filter(c => !c.loopDepth || c.loopDepth === 0)

  return {
    kind: 'composite-loop',
    containerVar: `__loop_${cv}`,
    // Branch-scoped loops use the raw array expression (no filter/sort chaining
    // path — BranchLoop doesn't carry those fields).
    arrayExpr: loop.array,
    keyFn: loopKeyFn(loop),
    paramHead,
    paramUnwrap,
    indexParam: loop.index || '__idx',
    mapPreambleWrapped: loop.mapPreamble ? wrap(loop.mapPreamble) : '',
    template: loop.template,
    outerComps: filterCondCompsOut(outerCompsByDepth, loop.childConditionals),
    outerEvents: childEvents.filter(ev => ev.nestedLoops.length === 0),
    innerLoops: buildInnerLoopsPlan({
      levels: depthLevels,
      parentElVar: '__el',
      outerLoopParam: loop.param,
      outerLoopParamBindings: loop.paramBindings,
    }),
    loopParam: loop.param,
    loopParamBindings: loop.paramBindings,
    reactiveEffects: hasReactiveBranch(loop)
      ? buildReactiveEffectsPlan({
          attrs: loop.childReactiveAttrs ?? [],
          texts: loop.childReactiveTexts ?? [],
          conditionals: loop.childConditionals,
          loopParam: loop.param,
          loopParamBindings: loop.paramBindings,
        })
      : null,
    branchClearChildren: true,
    topIndent: '      ',
    bodyIndent: '        ',
  }
}

/**
 * Drop outer-level child components whose `slotId` lives inside one of the
 * loop body's reactive conditional branches. Those components are managed by
 * the conditional's own `insert(...)` bindEvents — initialising them here
 * too would double-wire event handlers (#929).
 */
function filterCondCompsOut(
  outerComps: readonly IRLoopChildComponent[],
  conditionals: readonly LoopChildConditional[] | undefined,
): IRLoopChildComponent[] {
  if (!conditionals?.length) return [...outerComps]
  const condCompSlotIds = new Set<string>()
  for (const cond of conditionals) {
    for (const comp of [...cond.whenTrue.childComponents, ...cond.whenFalse.childComponents]) {
      if (comp.slotId) condCompSlotIds.add(comp.slotId)
    }
  }
  if (condCompSlotIds.size === 0) return [...outerComps]
  return outerComps.filter(c => !c.slotId || !condCompSlotIds.has(c.slotId))
}

function hasReactive(elem: TopLevelLoop): boolean {
  return (elem.childReactiveAttrs?.length ?? 0) > 0
    || (elem.childReactiveTexts?.length ?? 0) > 0
    || (elem.childConditionals?.length ?? 0) > 0
}

function hasReactiveBranch(loop: BranchLoop): boolean {
  return (loop.childReactiveAttrs?.length ?? 0) > 0
    || (loop.childReactiveTexts?.length ?? 0) > 0
    || (loop.childConditionals?.length ?? 0) > 0
}
