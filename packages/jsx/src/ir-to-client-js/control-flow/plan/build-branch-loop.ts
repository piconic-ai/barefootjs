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

import type { BranchLoop } from '../../types'
import { varSlotId, wrapLoopParamAsAccessor } from '../../utils'
import { buildBranchCompositePlan } from './build-composite-loop'
import { buildBranchLoopDelegationPlan } from './build-event-delegation'
import { buildReactiveEffectsPlan } from './build-reactive-effects'
import { destructureLoopParam, loopKeyFn } from '../shared'
import type {
  BranchCompositeLoopPlan,
  BranchLoopPlan,
  BranchPlainLoopPlan,
} from './branch-loop'

export function buildBranchLoopPlan(loop: BranchLoop): BranchLoopPlan {
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
  const hasReactiveEffects = (loop.childReactiveAttrs?.length ?? 0) > 0
    || (loop.childReactiveTexts?.length ?? 0) > 0
    || (loop.childConditionals?.length ?? 0) > 0

  const plan: BranchPlainLoopPlan = {
    kind: 'plain',
    containerSlotId,
    containerVar,
    arrayExpr: loop.array,
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
          attrs: loop.childReactiveAttrs ?? [],
          texts: loop.childReactiveTexts ?? [],
          conditionals: loop.childConditionals,
          loopParam: loop.param,
          loopParamBindings: loop.paramBindings,
        })
      : null,
    eventDelegation: buildBranchLoopDelegationPlan(loop, cv),
  }
  return plan
}
