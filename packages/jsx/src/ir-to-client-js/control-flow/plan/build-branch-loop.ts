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
import { buildLazyRowPlan } from './build-lazy-row.ts'
import type { LazyRowScopeInfo } from './lazy-row-eligibility.ts'
import { destructureLoopParam, loopKeyFn, buildChildRefBindings, buildPreambleRegionPlans } from '../shared.ts'
import { renderPreamble, irToHtmlTemplate } from '../../html-template.ts'
import type {
  BranchCompositeLoopPlan,
  BranchLoopPlan,
  BranchPlainLoopPlan,
} from './branch-loop.ts'

export function buildBranchLoopPlan(
  loop: BranchLoop,
  profileComponentName?: string,
  lazyScope?: LazyRowScopeInfo,
): BranchLoopPlan {
  const containerSlotId = loop.containerSlotId
  const cv = varSlotId(containerSlotId)
  const containerVar = `__loop_${cv}`

  if (loop.useElementReconciliation && (loop.nestedComponents?.length || loop.innerLoops?.length)) {
    const composite: BranchCompositeLoopPlan = {
      kind: 'composite',
      composite: buildBranchCompositePlan(loop, cv, profileComponentName),
      containerSlotId,
      containerVar,
    }
    return composite
  }

  const { head: paramHead, unwrap: paramUnwrap } = destructureLoopParam(loop.param, loop.paramBindings)
  const hasReactiveEffects = loop.bindings.reactiveAttrs.length > 0
    || loop.bindings.reactiveTexts.length > 0
    || loop.bindings.conditionals.length > 0

  // flatMap descriptor mode — see buildPlainLoopPlan (build-loop.ts).
  const fm = loop.flatMapClient
  const arrayExpr = fm
    ? `(${buildChainedArrayExpr(loop)}).flatMap(${fm.params} => ${fm.body})`
    : buildChainedArrayExpr(loop)
  const indexParam = loop.index || '__idx'
  const mapPreambleWrapped = loop.preamble
    ? renderPreamble(loop.preamble, {
        transformJs: (t) => wrapLoopParamAsAccessor(t, loop.param, loop.paramBindings),
        renderLeaf: (ir) => irToHtmlTemplate(ir, undefined, 1, [{ param: loop.param, bindings: loop.paramBindings }], undefined, true),
      })
    : ''
  const preambleRegions = buildPreambleRegionPlans(loop.preambleRegions, loop.param, loop.paramBindings)
  const plan: BranchPlainLoopPlan = {
    kind: 'plain',
    rowConstruction: 'string-template',
    containerSlotId,
    containerVar,
    markerId: loop.markerId,
    flatMapLeafItem: fm ? true : undefined,
    arrayExpr,
    keyFn: fm
      ? (fm.keyed ? '(__bfD, __bfI) => String(__bfD.k ?? __bfI)' : 'null')
      : loopKeyFn(loop),
    paramHead,
    paramUnwrap,
    indexParam,
    // Wrap loop-param references to signal-accessor form so the preamble
    // matches the template literal's already-wrapped reads (#1065).
    mapPreambleWrapped,
    // Lazy row graph (§9, L3) — undefined for every ineligible loop.
    lazyRow: buildLazyRowPlan({
      loop,
      arrayExpr,
      indexParam,
      paramUnwrap,
      mapPreambleWrapped,
      preambleRegionCount: preambleRegions.length,
      callSite: 'branch-plain',
      flatMapLeafItem: Boolean(fm),
      anchored: false,
      scope: lazyScope,
    }) ?? undefined,
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
    preambleRegions,
    bodyIsMultiRoot: loop.bodyIsMultiRoot ?? false,
    profileLoopId: profileComponentName ? `${profileComponentName}#binding:${containerSlotId}` : undefined,
  }
  return plan
}
