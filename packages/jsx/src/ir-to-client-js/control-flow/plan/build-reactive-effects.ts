/**
 * Build a `ReactiveEffectsPlan` from the loop's IR fields.
 *
 * Decisions resolved at build time (no longer in the stringifier):
 *   1. Group reactive attrs by `childSlotId` (one qsa() lookup per slot).
 *      `attrs` only ever carries outer-scope entries — the collector that
 *      produces it already stops descending into reactive conditionals
 *      (#2347), so no branch/outer partition is needed here.
 *   2. Wrap every attr / text / condition expression via
 *      `wrapLoopParamAsAccessor` so the stringifier never touches the wrap.
 *   3. Each conditional arm gets its own reactive attrs / texts directly
 *      from `LoopChildBranchSummary.reactiveAttrs` / `.reactiveTexts` —
 *      collected per-branch, recursively, so a doubly-nested conditional's
 *      arm carries its own bindings instead of an outer scope reaching in.
 *   4. Apply `addCondAttrToTemplate` to the wrapped branch HTML so the
 *      stringifier emits a ready-to-interpolate template literal.
 *   5. Recurse into the per-arm sub-plans via `LoopChildArmPlan` —
 *      events, child component inits, inner loops, nested conditionals,
 *      attrs, texts. No legacy passthrough remains.
 */

import type {
  TopLevelLoop,
  LoopChildBranchSummary,
  LoopChildConditional,
  LoopChildReactiveAttr,
  LoopChildReactiveText,
} from '../../types.ts'
import type { LoopParamBinding } from '../../../types.ts'
import { pickAttrMeta } from '../../../types.ts'
import { wrapLoopParamAsAccessor } from '../../utils.ts'
import { addCondAttrToTemplate } from '../../html-template.ts'
import {
  buildArmAttrsPlan,
  buildArmTextsPlan,
  buildBranchChildComponentInitsPlan,
  buildBranchEventBindingsPlan,
  buildBranchInnerLoopsPlan,
  buildLoopChildConditionalsPlan,
} from './build-loop-child-arm.ts'
import type { LoopChildArmPlan } from './loop-child-arm.ts'
import type {
  NestedConditionalPlan,
  ReactiveAttrSlot,
  ReactiveEffectsPlan,
  ReactiveTextEffect,
} from './reactive-effects.ts'

export interface BuildReactiveEffectsArgs {
  attrs: readonly LoopChildReactiveAttr[]
  texts: readonly LoopChildReactiveText[]
  conditionals: readonly LoopChildConditional[] | undefined
  loopParam: string
  loopParamBindings?: readonly LoopParamBinding[]
  /** Owning component name in profile mode (#1690, SR3) — else undefined. */
  profileComponentName?: string
}

/** Build a fully-resolved `ReactiveEffectsPlan` from the IR slice. */
export function buildReactiveEffectsPlan(
  args: BuildReactiveEffectsArgs,
): ReactiveEffectsPlan {
  const { attrs, texts, conditionals, loopParam, loopParamBindings, profileComponentName } = args
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

  // 2. Outer text effects. `texts` (elem.bindings.reactiveTexts) is produced
  //    by `collectLoopChildReactiveTexts`, which already stops descending
  //    into any reactive (slotId'd) conditional — so every entry here is
  //    genuinely outer-scope, no HTML-substring partition needed (#2347).
  const outerTexts: ReactiveTextEffect[] = texts.map(text => ({
    slotId: text.slotId,
    wrappedExpression: wrap(text.expression),
  }))

  // 3. Per-conditional plans. Each arm's own reactive attrs / texts come
  //    from `LoopChildBranchSummary.reactiveAttrs` / `.reactiveTexts` —
  //    collected directly on that branch's subtree (#2347) — instead of a
  //    flat list partitioned by searching the rendered branch HTML for a
  //    `bf:<slotId>` marker. The arm bodies are fully Plan-built — no
  //    legacy passthrough.
  const conditionalPlans: NestedConditionalPlan[] = []
  if (conditionals) {
    for (const cond of conditionals) {
      conditionalPlans.push({
        slotId: cond.slotId,
        wrappedCondition: wrap(cond.condition),
        whenTrueTemplateHtml: addCondAttrToTemplate(wrap(cond.whenTrueHtml), cond.slotId),
        whenFalseTemplateHtml: addCondAttrToTemplate(wrap(cond.whenFalseHtml), cond.slotId),
        whenTrueArm: buildOuterArm(cond.whenTrue, wrap, loopParam, loopParamBindings, profileComponentName),
        whenFalseArm: buildOuterArm(cond.whenFalse, wrap, loopParam, loopParamBindings, profileComponentName),
      })
    }
  }

  return {
    attrSlots,
    outerTexts,
    conditionals: conditionalPlans,
    profileComponentName,
  }
}

function buildOuterArm(
  branch: LoopChildBranchSummary,
  wrap: (expr: string) => string,
  loopParam: string,
  loopParamBindings: readonly LoopParamBinding[] | undefined,
  profileComponentName?: string,
): LoopChildArmPlan {
  return {
    events: buildBranchEventBindingsPlan({
      events: branch.events,
      wrap,
      profileComponentName,
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
    attrs: buildArmAttrsPlan(branch.reactiveAttrs, wrap),
    texts: buildArmTextsPlan(branch.reactiveTexts, wrap),
  }
}

/**
 * Convenience: build a ReactiveEffectsPlan directly from a `TopLevelLoop`,
 * pulling the same IR slice the legacy emitter consumed.
 */
export function buildLoopReactiveEffectsPlan(elem: TopLevelLoop, profileComponentName?: string): ReactiveEffectsPlan {
  return buildReactiveEffectsPlan({
    attrs: elem.bindings.reactiveAttrs,
    texts: elem.bindings.reactiveTexts,
    conditionals: elem.bindings.conditionals,
    loopParam: elem.param,
    loopParamBindings: elem.paramBindings,
    profileComponentName,
  })
}
