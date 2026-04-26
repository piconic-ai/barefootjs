/**
 * Plan types for emitting reactive effects (attrs, texts, conditionals)
 * inside a loop item's renderItem body.
 *
 * Every emission decision (attr-by-slot grouping, text-inside-conditional
 * partition, loop-param wrapping) is resolved at build time so the
 * stringifier becomes a deterministic walk of pre-computed data. Item 2
 * folded the per-arm sub-plans (events, child component inits, inner loops,
 * nested conditionals) into a single `LoopChildArmPlan`.
 */

import type { AttrMeta } from '../../../types'
import type { LoopChildArmPlan } from './loop-child-arm'

/** A single reactive attribute effect (one createEffect block). */
export interface ReactiveAttrEffect {
  attrName: string
  /** Already wrapped via wrapLoopParamAsAccessor at build time. */
  wrappedExpression: string
  /** Pre-copied attr metadata used by emitAttrUpdate. */
  meta: AttrMeta
}

/** Reactive attrs grouped by child slot (one qsa lookup per slot). */
export interface ReactiveAttrSlot {
  slotId: string
  attrs: readonly ReactiveAttrEffect[]
}

/** A reactive text effect (one createEffect updating textContent). */
export interface ReactiveTextEffect {
  slotId: string
  /** Already wrapped via wrapLoopParamAsAccessor at build time. */
  wrappedExpression: string
}

/**
 * Plan for one reactive conditional inside a loop scope. The HTML and
 * condition are wrapped at build time; per-arm `LoopChildArmPlan` carries
 * the events / child components / inner loops / nested conditionals /
 * branch-scoped text effects (all Plan-built — no legacy passthrough).
 *
 * The top-level conditional uses this type with the elVar supplied by the
 * stringifier's caller (e.g. `__el`, `__existing`, `__csrEl`). Recursive
 * (nested) conditionals use `LoopChildConditionalPlan` from
 * `loop-child-arm.ts`, which bakes in the parent scope variable.
 */
export interface NestedConditionalPlan {
  slotId: string
  /** Wrapped condition expression (already through wrapLoopParamAsAccessor). */
  wrappedCondition: string
  /** Wrapped + addCondAttrToTemplate'd whenTrue HTML — ready for `\`...\``. */
  whenTrueTemplateHtml: string
  /** Wrapped + addCondAttrToTemplate'd whenFalse HTML. */
  whenFalseTemplateHtml: string
  whenTrueArm: LoopChildArmPlan
  whenFalseArm: LoopChildArmPlan
}

export interface ReactiveEffectsPlan {
  attrSlots: readonly ReactiveAttrSlot[]
  /** Text effects scoped to the outer renderItem (not inside any conditional). */
  outerTexts: readonly ReactiveTextEffect[]
  conditionals: readonly NestedConditionalPlan[]
}
