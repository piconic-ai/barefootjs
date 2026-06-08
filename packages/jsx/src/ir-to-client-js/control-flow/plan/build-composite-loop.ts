/**
 * Build `CompositeLoopPlan` for top-level (`emitCompositeElementReconciliation`)
 * and branch-scoped (`emitCompositeBranchLoop`) composite loops.
 *
 * The two contexts share the same renderItem body shape — only the container
 * variable, the array expression chaining, and indentation differ. Both
 * variants are produced by the same builder so the stringifier sees one
 * consistent Plan.
 */

import type { TopLevelLoop, BranchLoop, LoopChildConditional } from '../../types.ts'
import type { IRLoopChildComponent } from '../../../types.ts'
import {
  buildChainedArrayExpr,
  varSlotId,
  wrapLoopParamAsAccessor,
} from '../../utils.ts'
import {
  loopKeyFn,
  destructureLoopParam,
  buildDepthLevels,
  buildChildRefBindings,
} from '../shared.ts'
import { buildReactiveEffectsPlan } from './build-reactive-effects.ts'
import { buildInnerLoopsPlan } from './build-inner-loop.ts'
import type { CompositeLoopPlan } from './types.ts'

/** @internal — prefer `buildLoopPlan`. */
export function buildTopLevelCompositePlan(elem: TopLevelLoop, profileComponentName?: string): CompositeLoopPlan {
  const nestedComps = elem.nestedComponents!
  const depthLevels = buildDepthLevels(elem.innerLoops ?? [], nestedComps, elem.bindings.events)
  const { head: paramHead, unwrap: paramUnwrap } = destructureLoopParam(elem.param, elem.paramBindings)
  const wrap = (expr: string) => wrapLoopParamAsAccessor(expr, elem.param, elem.paramBindings)

  const outerCompsByDepth = nestedComps.filter(c => !c.loopDepth || c.loopDepth === 0)

  return {
    kind: 'composite',
    containerVar: `_${varSlotId(elem.slotId)}`,
    markerId: elem.markerId,
    arrayExpr: buildChainedArrayExpr(elem),
    keyFn: loopKeyFn(elem),
    paramHead,
    paramUnwrap,
    indexParam: elem.index || '__idx',
    mapPreambleWrapped: elem.mapPreamble ? wrap(elem.mapPreamble) : '',
    template: elem.template,
    outerComps: filterCondCompsOut(outerCompsByDepth, elem.bindings.conditionals),
    outerEvents: elem.bindings.events.filter(ev => ev.nestedLoops.length === 0),
    childRefs: buildChildRefBindings(elem.bindings.refs, elem.param, elem.paramBindings),
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
          attrs: elem.bindings.reactiveAttrs,
          texts: elem.bindings.reactiveTexts,
          conditionals: elem.bindings.conditionals,
          loopParam: elem.param,
          loopParamBindings: elem.paramBindings,
          profileComponentName,
        })
      : null,
    branchClearChildren: false,
    topIndent: '  ',
    bodyIndent: '    ',
    bodyIsMultiRoot: elem.bodyIsMultiRoot ?? false,
    profileLoopId: profileComponentName ? `${profileComponentName}#binding:${elem.slotId}` : undefined,
    profileComponentName,
  }
}

export function buildBranchCompositePlan(loop: BranchLoop, cv: string, profileComponentName?: string): CompositeLoopPlan {
  const nestedComps = loop.nestedComponents!
  const innerLoops = loop.innerLoops ?? []
  const childEvents = loop.bindings.events
  const depthLevels = buildDepthLevels(innerLoops, nestedComps, childEvents)
  const { head: paramHead, unwrap: paramUnwrap } = destructureLoopParam(loop.param, loop.paramBindings)
  const wrap = (expr: string) => wrapLoopParamAsAccessor(expr, loop.param, loop.paramBindings)

  const outerCompsByDepth = nestedComps.filter(c => !c.loopDepth || c.loopDepth === 0)

  return {
    kind: 'composite',
    containerVar: `__loop_${cv}`,
    markerId: loop.markerId,
    // Chain `.filter()` / `.toSorted()` onto the source array so the mapArray
    // call emitted inside the branch tracks signals read by the predicate
    // / comparator (#1434).
    arrayExpr: buildChainedArrayExpr(loop),
    keyFn: loopKeyFn(loop),
    paramHead,
    paramUnwrap,
    indexParam: loop.index || '__idx',
    mapPreambleWrapped: loop.mapPreamble ? wrap(loop.mapPreamble) : '',
    template: loop.template,
    outerComps: filterCondCompsOut(outerCompsByDepth, loop.bindings.conditionals),
    outerEvents: childEvents.filter(ev => ev.nestedLoops.length === 0),
    childRefs: buildChildRefBindings(loop.bindings.refs, loop.param, loop.paramBindings),
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
          attrs: loop.bindings.reactiveAttrs,
          texts: loop.bindings.reactiveTexts,
          conditionals: loop.bindings.conditionals,
          loopParam: loop.param,
          loopParamBindings: loop.paramBindings,
          profileComponentName,
        })
      : null,
    branchClearChildren: true,
    topIndent: '      ',
    bodyIndent: '        ',
    bodyIsMultiRoot: loop.bodyIsMultiRoot ?? false,
    profileLoopId: profileComponentName ? `${profileComponentName}#binding:${loop.containerSlotId}` : undefined,
    profileComponentName,
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
  return elem.bindings.reactiveAttrs.length > 0
    || elem.bindings.reactiveTexts.length > 0
    || elem.bindings.conditionals.length > 0
}

function hasReactiveBranch(loop: BranchLoop): boolean {
  return loop.bindings.reactiveAttrs.length > 0
    || loop.bindings.reactiveTexts.length > 0
    || loop.bindings.conditionals.length > 0
}
