/**
 * Build a `BranchLoopPlan` from a `BranchLoop` IR node.
 *
 * Mirrors the legacy `emitBranchLoopBody` dispatch:
 *
 *   - composite path: `buildBranchCompositePlan(loop, cv)` for branches whose
 *     items contain child components or inner loops.
 *   - plain path: build a `BranchPlainLoopPlan` carrying the renderItem
 *     skeleton + a fully-resolved `ReactiveEffectsPlan` + the existing
 *     event-delegation plan.
 */

import type { BranchLoop } from '../../types.ts'
import { buildChainedArrayExpr, varSlotId, wrapLoopParamAsAccessor } from '../../utils.ts'
import { buildBranchCompositePlan } from './build-composite-loop.ts'
import { buildBranchLoopDelegationPlan } from './build-event-delegation.ts'
import { buildReactiveEffectsPlan } from './build-reactive-effects.ts'
import { destructureLoopParam, loopKeyFn, buildChildRefBindings } from '../shared.ts'
import type {
  BranchCompositeLoopPlan,
  BranchLoopPlan,
  BranchPlainLoopPlan,
} from './branch-loop.ts'

export function buildBranchLoopPlan(loop: BranchLoop, profileComponentName?: string): BranchLoopPlan {
  const containerSlotId = loop.containerSlotId
  const cv = varSlotId(containerSlotId)
  const containerVar = `__loop_${cv}`

  if (loop.useElementReconciliation && (loop.nestedComponents?.length || loop.innerLoops?.length)) {
    const composite: BranchCompositeLoopPlan = {
      kind: 'composite',
      composite: buildBranchCompositePlan(loop, cv),
      containerSlotId,
      containerVar,
    }
    return composite
  }

  const { head: paramHead, unwrap: paramUnwrap } = destructureLoopParam(loop.param, loop.paramBindings)
  const hasReactiveEffects = loop.bindings.reactiveAttrs.length > 0
    || loop.bindings.reactiveTexts.length > 0
    || loop.bindings.conditionals.length > 0

  const plan: BranchPlainLoopPlan = {
    kind: 'plain',
    containerSlotId,
    containerVar,
    markerId: loop.markerId,
    arrayExpr: buildChainedArrayExpr(loop),
    keyFn: loopKeyFn(loop),
    paramHead,
    paramUnwrap,
    indexParam: loop.index || '__idx',
    // Wrap loop-param references to signal-accessor form so the preamble
    // matches the template literal's already-wrapped reads (#1065).
    mapPreambleWrapped: loop.mapPreamble
      ? wrapLoopParamAsAccessor(loop.mapPreamble, loop.param, loop.paramBindings)
      : '',
    template: loop.template,
    reactiveEffects: hasReactiveEffects
      ? buildReactiveEffectsPlan({
          attrs: loop.bindings.reactiveAttrs,
          texts: loop.bindings.reactiveTexts,
          conditionals: loop.bindings.conditionals,
          loopParam: loop.param,
          loopParamBindings: loop.paramBindings,
          profileComponentName,
        })
      : null,
    eventDelegation: buildBranchLoopDelegationPlan(loop, cv, profileComponentName),
    childRefs: buildChildRefBindings(loop.bindings.refs, loop.param, loop.paramBindings),
    bodyIsMultiRoot: loop.bodyIsMultiRoot ?? false,
  }
  return plan
}
