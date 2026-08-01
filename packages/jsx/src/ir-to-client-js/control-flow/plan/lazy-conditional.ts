/**
 * Is a row's reactive conditional drivable from the LOOP-level apply bodies? —
 * `spec/slot-unification.md` §9.5, the "row contains a reactive conditional"
 * widening.
 *
 * ## Why it was refused wholesale
 *
 * The eager emission calls `insert(__el, 'sN', () => cond, trueArm, falseArm)`
 * once per row. `insert` creates **one `createEffect` per call**, plus it probes
 * both branch templates at runtime to decide element-vs-fragment form, resolves
 * a search region, and manages per-branch `bindEvents` cleanup. Calling it from
 * a lazy row would reinstate exactly the per-row reactive resource the lazy row
 * graph exists to remove — so the gate refused any row with a conditional at
 * all.
 *
 * ## What this accepts, and why that is the whole job
 *
 * For the narrow case where **both arms are wiring-free static elements**,
 * everything `insert` does collapses to one operation: replace the
 * `[bf-c="sN"]` element with the other arm's markup when the condition flips.
 * No `bindEvents`, no branch cleanup, no auto-focus, no `__bfSlot` live-node
 * splicing — those all exist for arms that own something, and these arms own
 * nothing.
 *
 * That case needs no runtime helper. Both arms are compile-time constants, so
 * each is parsed ONCE per loop into a hoisted `<template>` and cloned per swap,
 * the same trick the row template already uses. What is left per row is a
 * boolean, a dedup slot, and a `replaceWith` — which the existing
 * `applyItem`/`applyOuter` bodies can carry directly.
 *
 * ## The four things that must be proven
 *
 *  1. **Both arms are wiring-free.** Every `LoopChildBranchSummary` collection
 *     must be empty. A single reactive text inside an arm means the arm's
 *     content has to track the item, which needs wiring this shape has no place
 *     for.
 *  2. **Both arms are ELEMENT conditionals.** The caller passes each arm through
 *     `addCondAttrToTemplate` — the same door the eager emission uses — which
 *     injects `bf-c="<slotId>"` on a single root element and otherwise wraps the
 *     arm in `<!--bf-cond-start:id-->` markers. So the two forms are told apart
 *     by reading its output, not by re-deciding here. A FRAGMENT conditional
 *     spans a sibling range with no single node to replace, which is why
 *     `insert` carries a second code path for it.
 *  3. **Both arms' HTML is static.** The arm strings are emitted inside a
 *     template literal, so an interpolation survives as `${…}`. Anything
 *     containing one is refused — it would have to be re-evaluated per row,
 *     defeating the hoist. (A literal `${` in authored TEXT would also refuse
 *     here; that is the safe direction — a false refusal costs the eager
 *     fallback, a false accept would ship a frozen arm.)
 *  4. **The condition does not read the loop INDEX.** `applyItem` and
 *     `applyOuter` have no index parameter, the same reason
 *     `ClassifiedLazyBinding.referencesIndex` refuses a binding.
 *
 * Everything refused carries a specific reason, which `lazyRowEligibility`
 * passes through unchanged.
 */

import type { LoopChildBranchSummary, LoopChildConditional } from '../../types.ts'

/** The prepared arm markup the caller hands in, and this module vets. */
export interface PreparedArms {
  /**
   * Loop-param wrapped and passed through `addCondAttrToTemplate`, i.e. exactly
   * the strings the eager path would emit. Vetting the PREPARED form is the
   * point: the raw `IRLoop` arm HTML carries no `bf-c` at all, so an
   * element-vs-fragment decision made on it would be guesswork.
   */
  whenTrueHtml: string
  whenFalseHtml: string
}

/** A row conditional the loop-level apply bodies can drive. */
export interface LazyConditionalFacts {
  slotId: string
  /** Condition expression, NOT yet loop-param wrapped (the caller wraps). */
  condition: string
  /** Arm markup, static by construction — hoisted and cloned per swap. */
  whenTrueHtml: string
  whenFalseHtml: string
}

export type LazyConditionalAnalysis =
  | { lazySafe: true; facts: LazyConditionalFacts }
  | { lazySafe: false; reason: string }

const NO = (reason: string): LazyConditionalAnalysis => ({ lazySafe: false, reason })

/** Names every non-empty collection on a branch summary, for the reason text. */
function wiringOn(branch: LoopChildBranchSummary): string[] {
  const found: string[] = []
  if (branch.childComponents.length > 0) found.push('child components')
  if (branch.innerLoops && branch.innerLoops.length > 0) found.push('an inner loop')
  if (branch.conditionals && branch.conditionals.length > 0) found.push('a nested conditional')
  if (branch.events && branch.events.length > 0) found.push('events')
  if (branch.reactiveAttrs && branch.reactiveAttrs.length > 0) found.push('reactive attrs')
  if (branch.reactiveTexts && branch.reactiveTexts.length > 0) found.push('reactive text')
  return found
}

/**
 * Decide whether `cond` can be driven from the loop-level apply bodies.
 *
 * `indexParam` is the loop's index parameter name as the emitter uses it
 * (`elem.index || '__idx'`); a condition reading it is refused.
 */
export function analyzeLazyConditional(
  cond: LoopChildConditional,
  indexParam: string,
  arms: PreparedArms,
): LazyConditionalAnalysis {
  for (const [label, branch] of [['true', cond.whenTrue], ['false', cond.whenFalse]] as const) {
    const wiring = wiringOn(branch)
    if (wiring.length > 0) {
      return NO(`conditional on slot ${cond.slotId}: its ${label} arm owns ${wiring.join(' + ')}`)
    }
  }

  for (const [label, html] of [['true', arms.whenTrueHtml], ['false', arms.whenFalseHtml]] as const) {
    if (html.includes('bf-cond-start:')) {
      return NO(`conditional on slot ${cond.slotId}: its ${label} arm is a fragment conditional`)
    }
    if (!html.includes(`bf-c="${cond.slotId}"`)) {
      return NO(`conditional on slot ${cond.slotId}: its ${label} arm has no single bf-c root`)
    }
    // The arm is emitted inside a template literal; a surviving `${` means the
    // markup depends on the item and cannot be hoisted once per loop.
    if (html.includes('${')) {
      return NO(`conditional on slot ${cond.slotId}: its ${label} arm interpolates a value`)
    }
  }

  // `conditionFreeIdentifiers` is pre-computed by the analyzer (#1267). Absent
  // means unprovable, which is a refusal rather than an assumption — the same
  // stance the binding gate takes for a missing identifier set.
  if (!cond.conditionFreeIdentifiers) {
    return NO(`conditional on slot ${cond.slotId}: condition has no analyzable identifier set`)
  }
  if (cond.conditionFreeIdentifiers.has(indexParam)) {
    return NO(`conditional on slot ${cond.slotId}: condition reads the loop index parameter '${indexParam}'`)
  }

  return {
    lazySafe: true,
    facts: {
      slotId: cond.slotId,
      condition: cond.condition,
      whenTrueHtml: arms.whenTrueHtml,
      whenFalseHtml: arms.whenFalseHtml,
    },
  }
}
