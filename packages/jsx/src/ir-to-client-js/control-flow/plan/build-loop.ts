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
  exprReferencesAny,
  varSlotId,
  wrapLoopParamAsAccessor,
} from '../../utils'
import {
  loopKeyFn,
  destructureLoopParam,
} from '../shared'
import { buildLoopReactiveEffectsPlan } from './build-reactive-effects'
import type { PlainLoopPlan, StaticLoopMaterializePlan, StaticLoopPlan } from './types'

export function buildPlainLoopPlan(elem: TopLevelLoop): PlainLoopPlan {
  const wrap = (expr: string) => wrapLoopParamAsAccessor(expr, elem.param, elem.paramBindings)
  const { head: paramHead, unwrap: paramUnwrap } = destructureLoopParam(elem.param, elem.paramBindings)
  const hasReactive = elem.childReactiveAttrs.length > 0
    || elem.childReactiveTexts.length > 0
    || (elem.childConditionals?.length ?? 0) > 0

  return {
    kind: 'plain-loop',
    containerVar: `_${varSlotId(elem.slotId)}`,
    markerId: elem.markerId,
    arrayExpr: buildChainedArrayExpr(elem),
    keyFn: loopKeyFn(elem),
    paramHead,
    paramUnwrap,
    indexParam: elem.index || '__idx',
    mapPreambleWrapped: elem.mapPreamble ? wrap(elem.mapPreamble) : '',
    template: elem.template,
    reactiveEffects: hasReactive ? buildLoopReactiveEffectsPlan(elem) : null,
    bodyIsMultiRoot: elem.bodyIsMultiRoot ?? false,
  }
}

export function buildStaticLoopPlan(elem: TopLevelLoop, unsafeLocalNames: Set<string>): StaticLoopPlan {
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
    csrMaterialize: buildStaticLoopMaterialize(elem, unsafeLocalNames),
  }
}

/**
 * Decide whether the CSR template will substitute the loop's array with `[]`
 * (the unsafe-name fallback in `html-template.ts`) and, if so, package the
 * inputs the stringifier needs to clone per-iteration children into the
 * container at hydrate time (#1247).
 *
 * Skipped when:
 *   - the array is safe in template scope (the CSR template already emits
 *     items via `.map(...)`, no fallback needed),
 *   - the loop body is a child component or composite/element-reconciled
 *     shape (the SSR-then-CSR mismatch in that case is handled by the
 *     dynamic-loop path; the static branch here only materialises plain
 *     element bodies), or
 *   - the loop's per-iteration template wasn't built (childComponent path).
 */
function buildStaticLoopMaterialize(
  elem: TopLevelLoop,
  unsafeLocalNames: Set<string>,
): StaticLoopMaterializePlan | null {
  if (unsafeLocalNames.size === 0) return null
  if (!elem.staticItemTemplate) return null
  if (elem.childComponent) return null
  if (elem.useElementReconciliation) return null
  if (!exprReferencesAny(elem.array, unsafeLocalNames)) return null
  return {
    itemTemplate: elem.staticItemTemplate,
    mapPreamble: elem.mapPreamble ?? '',
    bodyIsMultiRoot: elem.bodyIsMultiRoot ?? false,
  }
}
