/**
 * Build LoopPlan variants from a `TopLevelLoop` IR node.
 *
 * Coverage (PR 2-a):
 *   - PlainLoopPlan  ← plain element body, no child components, no inner loops
 *   - StaticLoopPlan ← static array (literal) with reactive attrs / texts
 *
 * PR 2-b will add `SingleComponentLoopPlan`; PR 2-c adds `CompositeLoopPlan`.
 */

import type {
  TopLevelLoop,
  LoopChildReactiveAttr,
} from '../../types'
import {
  buildChainedArrayExpr,
  varSlotId,
  wrapLoopParamAsAccessor,
} from '../../utils'
import {
  loopKeyFn,
  destructureLoopParam,
} from '../shared'
import { buildLoopReactiveEffectsPlan } from './build-reactive-effects'
import type { PlainLoopPlan, StaticLoopPlan } from './types'

export function buildPlainLoopPlan(elem: TopLevelLoop): PlainLoopPlan {
  const wrap = (expr: string) => wrapLoopParamAsAccessor(expr, elem.param, elem.paramBindings)
  const { head: paramHead, unwrap: paramUnwrap } = destructureLoopParam(elem.param, elem.paramBindings)
  const hasReactive = elem.childReactiveAttrs.length > 0
    || elem.childReactiveTexts.length > 0
    || (elem.childConditionals?.length ?? 0) > 0

  return {
    kind: 'plain-loop',
    containerVar: `_${varSlotId(elem.slotId)}`,
    arrayExpr: buildChainedArrayExpr(elem),
    keyFn: loopKeyFn(elem),
    paramHead,
    paramUnwrap,
    indexParam: elem.index || '__idx',
    mapPreambleWrapped: elem.mapPreamble ? wrap(elem.mapPreamble) : '',
    template: elem.template,
    reactiveEffects: hasReactive ? buildLoopReactiveEffectsPlan(elem) : null,
  }
}

export function buildStaticLoopPlan(elem: TopLevelLoop): StaticLoopPlan {
  // Group reactive attrs by their child slot id, preserving the legacy
  // declaration-order Map-iteration semantics.
  const attrsBySlotMap = new Map<string, LoopChildReactiveAttr[]>()
  if (!elem.childComponent) {
    for (const attr of elem.childReactiveAttrs) {
      let bucket = attrsBySlotMap.get(attr.childSlotId)
      if (!bucket) {
        bucket = []
        attrsBySlotMap.set(attr.childSlotId, bucket)
      }
      bucket.push(attr)
    }
  }

  const indexParam = elem.index || '__idx'
  const childIndexExpr = elem.siblingOffset ? `${indexParam} + ${elem.siblingOffset}` : indexParam

  return {
    kind: 'static-loop',
    containerVar: `_${varSlotId(elem.slotId)}`,
    arrayExpr: elem.array,
    param: elem.param,
    indexParam,
    childIndexExpr,
    attrsBySlot: [...attrsBySlotMap].map(([slotId, attrs]) => [slotId, attrs] as const),
    texts: elem.childReactiveTexts,
  }
}
