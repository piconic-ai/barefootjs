/**
 * Build a `ReactiveEffectsPlan` from the loop's IR fields.
 *
 * Decisions resolved at build time (no longer in the stringifier):
 *   1. Group reactive attrs by `childSlotId` (one qsa() lookup per slot).
 *   2. Wrap every attr / text / condition expression via
 *      `wrapLoopParamAsAccessor` so the stringifier never touches the wrap.
 *   3. Partition reactive texts: those whose slot id appears inside any
 *      conditional branch HTML must be emitted *inside* that branch's
 *      `bindEvents` (insert() may replace the DOM nodes), the rest stay in
 *      the outer renderItem scope.
 *   4. Apply `addCondAttrToTemplate` to the wrapped branch HTML so the
 *      stringifier emits a ready-to-interpolate template literal.
 *   5. Recurse into the per-arm sub-plans via `LoopChildArmPlan` —
 *      events, child component inits, inner loops, nested conditionals.
 *      No legacy passthrough remains.
 */

import type {
  TopLevelLoop,
  LoopChildBranchSummary,
  LoopChildConditional,
  LoopChildReactiveAttr,
  LoopChildReactiveText,
} from '../../types'
import type { LoopParamBinding } from '../../../types'
import { pickAttrMeta } from '../../../types'
import { wrapLoopParamAsAccessor } from '../../utils'
import { addCondAttrToTemplate } from '../../html-template'
import {
  buildBranchChildComponentInitsPlan,
  buildBranchEventBindingsPlan,
  buildBranchInnerLoopsPlan,
  buildLoopChildConditionalsPlan,
} from './build-loop-child-arm'
import type {
  LoopChildArmPlan,
  LoopChildArmText,
} from './loop-child-arm'
import type {
  NestedConditionalPlan,
  ReactiveAttrSlot,
  ReactiveEffectsPlan,
  ReactiveTextEffect,
} from './reactive-effects'

export interface BuildReactiveEffectsArgs {
  attrs: readonly LoopChildReactiveAttr[]
  texts: readonly LoopChildReactiveText[]
  conditionals: readonly LoopChildConditional[] | undefined
  loopParam: string
  loopParamBindings?: readonly LoopParamBinding[]
}

/** Build a fully-resolved `ReactiveEffectsPlan` from the IR slice. */
export function buildReactiveEffectsPlan(
  args: BuildReactiveEffectsArgs,
): ReactiveEffectsPlan {
  const { attrs, texts, conditionals, loopParam, loopParamBindings } = args
  const wrap = (expr: string) => wrapLoopParamAsAccessor(expr, loopParam, loopParamBindings)

  // 1. Group attrs by slot, preserving declaration order (Map insertion order
  //    matches the legacy iteration that produced byte-identical output).
  const attrsBySlot = new Map<string, LoopChildReactiveAttr[]>()
  for (const attr of attrs) {
    let bucket = attrsBySlot.get(attr.childSlotId)
    if (!bucket) {
      bucket = []
      attrsBySlot.set(attr.childSlotId, bucket)
    }
    bucket.push(attr)
  }
  const attrSlots: ReactiveAttrSlot[] = []
  for (const [slotId, slotAttrs] of attrsBySlot) {
    attrSlots.push({
      slotId,
      attrs: slotAttrs.map(attr => ({
        attrName: attr.attrName,
        wrappedExpression: wrap(attr.expression),
        meta: pickAttrMeta(attr),
      })),
    })
  }

  // 2. Identify text slots that must be deferred into a conditional branch's
  //    bindEvents. The check mirrors the legacy `cond.whenXxxHtml.includes(
  //    'bf:' + slotId)` heuristic — the rendered template HTML is the only
  //    pre-runtime signal available.
  const textSlotsInConditionals = new Set<string>()
  if (conditionals) {
    for (const cond of conditionals) {
      for (const text of texts) {
        if (
          cond.whenTrueHtml.includes(`bf:${text.slotId}`) ||
          cond.whenFalseHtml.includes(`bf:${text.slotId}`)
        ) {
          textSlotsInConditionals.add(text.slotId)
        }
      }
    }
  }

  const outerTexts: ReactiveTextEffect[] = []
  for (const text of texts) {
    if (textSlotsInConditionals.has(text.slotId)) continue
    outerTexts.push({
      slotId: text.slotId,
      wrappedExpression: wrap(text.expression),
    })
  }

  // 3. Per-conditional plans. Branch-scoped texts are partitioned by which
  //    branch HTML mentions the slot (declaration order preserved). The
  //    arm bodies are fully Plan-built — no legacy passthrough.
  const conditionalPlans: NestedConditionalPlan[] = []
  if (conditionals) {
    for (const cond of conditionals) {
      const trueTexts: LoopChildArmText[] = []
      const falseTexts: LoopChildArmText[] = []
      for (const text of texts) {
        if (!textSlotsInConditionals.has(text.slotId)) continue
        const wrapped: LoopChildArmText = {
          slotId: text.slotId,
          wrappedExpression: wrap(text.expression),
        }
        if (cond.whenTrueHtml.includes(`bf:${text.slotId}`)) trueTexts.push(wrapped)
        if (cond.whenFalseHtml.includes(`bf:${text.slotId}`)) falseTexts.push(wrapped)
      }
      conditionalPlans.push({
        slotId: cond.slotId,
        wrappedCondition: wrap(cond.condition),
        whenTrueTemplateHtml: addCondAttrToTemplate(wrap(cond.whenTrueHtml), cond.slotId),
        whenFalseTemplateHtml: addCondAttrToTemplate(wrap(cond.whenFalseHtml), cond.slotId),
        whenTrueArm: buildOuterArm(cond.whenTrue, trueTexts, wrap, loopParam, loopParamBindings),
        whenFalseArm: buildOuterArm(cond.whenFalse, falseTexts, wrap, loopParam, loopParamBindings),
      })
    }
  }

  return {
    attrSlots,
    outerTexts,
    conditionals: conditionalPlans,
  }
}

function buildOuterArm(
  branch: LoopChildBranchSummary,
  texts: readonly LoopChildArmText[],
  wrap: (expr: string) => string,
  loopParam: string,
  loopParamBindings: readonly LoopParamBinding[] | undefined,
): LoopChildArmPlan {
  return {
    events: buildBranchEventBindingsPlan({
      events: branch.events,
      wrap,
    }),
    childComponents: buildBranchChildComponentInitsPlan({
      components: branch.childComponents,
      wrap,
    }),
    innerLoops: buildBranchInnerLoopsPlan({
      innerLoops: branch.innerLoops,
      scopeVar: '__branchScope',
      outerLoopParam: loopParam,
      outerLoopParamBindings: loopParamBindings,
      wrapOuter: wrap,
    }),
    nestedConditionals: buildLoopChildConditionalsPlan({
      conditionals: branch.conditionals,
      scopeVar: '__branchScope',
      wrap,
      loopParam,
      loopParamBindings,
    }),
    texts,
  }
}

/**
 * Convenience: build a ReactiveEffectsPlan directly from a `TopLevelLoop`,
 * pulling the same IR slice the legacy emitter consumed.
 */
export function buildLoopReactiveEffectsPlan(elem: TopLevelLoop): ReactiveEffectsPlan {
  return buildReactiveEffectsPlan({
    attrs: elem.childReactiveAttrs ?? [],
    texts: elem.childReactiveTexts ?? [],
    conditionals: elem.childConditionals,
    loopParam: elem.param,
    loopParamBindings: elem.paramBindings,
  })
}
