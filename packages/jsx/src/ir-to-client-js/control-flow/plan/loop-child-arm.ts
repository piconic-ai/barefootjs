/**
 * Plan types for the body of a single arm (whenTrue / whenFalse) of a
 * loop-scoped conditional (`NestedConditionalPlan`).
 *
 * Item 2 of `tmp/emit-survey/HANDOFF.md` plan-ifies the recursive
 * branch ↔ loop ↔ conditional helpers. This file accumulates the per-arm
 * sub-plans as each helper is migrated:
 *
 *   - `BranchEventBindingsPlan`       — Item 2a (this PR)
 *   - `BranchChildComponentInitsPlan` — Item 2b
 *   - `BranchInnerLoopsPlan`          — Item 2c
 *   - nested `NestedConditionalPlan[]`— Item 2d
 *
 * Once every helper is migrated, an `LoopChildArmPlan` aggregate will
 * consolidate every arm-scoped concern under one type.
 */

/** A single addEventListener emitted inside an arm's bindEvents. */
export interface BranchEventListener {
  eventName: string
  /** Already wrapped via wrapLoopParamAsAccessor at build time. */
  wrappedHandler: string
}

/** Listeners grouped by slot (one qsa() lookup per slot). */
export interface BranchEventSlot {
  slotId: string
  listeners: readonly BranchEventListener[]
}

/**
 * Pre-built event bindings for one arm of a loop-scoped conditional. An
 * empty list means the stringifier emits nothing.
 */
export type BranchEventBindingsPlan = readonly BranchEventSlot[]

/**
 * One child component initialiser inside an arm body (qsa() + initChild for
 * SSR, or placeholder replacement + createComponent for CSR). The selector,
 * placeholder id, and props object expression are all resolved at build time
 * — the stringifier just emits a single line per entry.
 */
export interface BranchChildComponentInit {
  /** Component tag name, e.g. `"Card"`. */
  name: string
  /** CSS selector passed to qsa(): `[bf-s$="_<slotId>"]` or `[bf-s^="~<name>_"]`. */
  selector: string
  /** Identifier used by the data-bf-ph attribute on the CSR placeholder. */
  placeholderId: string
  /** Pre-built props object expression (e.g. `{ get foo() { return ... } }`). */
  propsExpr: string
}

/**
 * Pre-built child component initialisers for one arm of a loop-scoped
 * conditional. Empty list ⇒ stringifier emits nothing.
 */
export type BranchChildComponentInitsPlan = readonly BranchChildComponentInit[]

/** A reactive text effect inside a branch inner loop's renderItem body. */
export interface BranchInnerLoopText {
  slotId: string
  /** Already wrapped via inner+outer loop param accessor (`wrapBoth`). */
  wrappedExpression: string
  /**
   * When true, the text's slot lives inside a conditional branch — the
   * stringifier emits a `createEffect` that re-queries `$t` on every run
   * (insert() may swap the text node and stale references would silently
   * stop updating).
   */
  insideConditional: boolean
}

/**
 * One inner loop emitted inside a conditional branch's `bindEvents`. The
 * outer-mapArray plumbing (container query, array expr, key fn, template
 * clone, key attr) is fully resolved here; the renderItem body components,
 * events, texts, and nested conditionals are still consumed by the legacy
 * helpers (`emitComponentAndEventSetup`, `emitNestedLoopChildConditionals`).
 *
 * Items 2d / 2e fold those last two helpers into Plans, after which this
 * type can drop the `legacy*` carriers.
 */
export interface BranchInnerLoop {
  /** Unique suffix used in `__bel`/`__bic`/`__bidx` variable names. */
  uidSuffix: string
  /** Container resolution expression — already includes scope and selectors. */
  containerExpr: string
  /** Wrapped array expression (`wrapOuter(inner.array)`). */
  arrayExpr: string
  /** keyFn source — output of `loopKeyFn(inner)`. */
  keyFn: string
  /** mapArray renderItem param head — `inner.param` or `__bfItem`. */
  paramHead: string
  /** Body-entry unwrap statement (empty when no destructured param). */
  paramUnwrap: string
  /** Already-wrapped HTML template for one inner-loop item. */
  wrappedTemplate: string
  /** Pre-wrapped key expression for setAttribute, or null when no key. */
  wrappedKey: string | null
  /** Depth used by `keyAttrName(...)` — branch inner loops are always 1. */
  keyDepth: number
  /**
   * Inner-wrapped component IR for `emitComponentAndEventSetup`. Inner-wrap
   * runs at build time; the helper still applies `outerWrap` at emit time.
   */
  legacyComponents: readonly import('../../../types').IRLoopChildComponent[]
  /** Inner-wrapped event IR for `emitComponentAndEventSetup`. */
  legacyEvents: readonly import('../../types').LoopChildEvent[]
  /** Pre-wrapped reactive text effects for the inner-item body. */
  reactiveTexts: readonly BranchInnerLoopText[]
  /**
   * Plan-built nested conditionals for the inner-item body. Recursion is
   * captured fully in the Plan tree (#830 Path B); the stringifier walks
   * it without re-entering legacy helpers.
   */
  nestedConditionals: readonly LoopChildConditionalPlan[]
  /** Inner loop param identifier — needed for the legacy recursion. */
  innerLoopParam: string
  /** Inner loop param destructuring metadata. */
  innerLoopParamBindings?: readonly import('../../../types').LoopParamBinding[]
  /** Outer loop param identifier — threaded into emitComponentAndEventSetup. */
  outerLoopParam: string
  /** Outer loop param destructuring metadata. */
  outerLoopParamBindings?: readonly import('../../../types').LoopParamBinding[]
}

export type BranchInnerLoopsPlan = readonly BranchInnerLoop[]

/**
 * One branch-scoped reactive text effect (slotId + already-wrapped
 * expression). The top-level outer conditional's arms emit these inside
 * `bindEvents`; recursive nested conditionals never carry texts.
 */
export interface LoopChildArmText {
  slotId: string
  wrappedExpression: string
}

/**
 * Aggregate plan for the body of one arm (`whenTrue` / `whenFalse`) of a
 * loop-scoped conditional. Each sub-plan is a Plan-built carrier produced
 * by the matching `build*` helper:
 *
 *   - `events`            — `buildBranchEventBindingsPlan`
 *   - `childComponents`   — `buildBranchChildComponentInitsPlan`
 *   - `innerLoops`        — `buildBranchInnerLoopsPlan`
 *   - `nestedConditionals`— `buildLoopChildConditionalPlan` (recursive)
 *
 * `texts` is only populated for the *outer* conditional — the recursion
 * branch (`emitNestedLoopChildConditionals` legacy) never threaded text
 * effects through, so nested arms always carry an empty list.
 */
export interface LoopChildArmPlan {
  events: BranchEventBindingsPlan
  childComponents: BranchChildComponentInitsPlan
  innerLoops: BranchInnerLoopsPlan
  nestedConditionals: readonly LoopChildConditionalPlan[]
  texts: readonly LoopChildArmText[]
}

/**
 * Plan for one `insert(scopeVar, slotId, () => cond, whenTrueArm,
 * whenFalseArm)` inside a loop scope. The Plan tree is fully recursive
 * via `LoopChildArmPlan.nestedConditionals` — the stringifier walks the
 * tree without re-entering the legacy `emitNestedLoopChildConditionals`.
 */
export interface LoopChildConditionalPlan {
  slotId: string
  /** Element variable to pass as the first arg of `insert(...)`. */
  scopeVar: string
  /** Already-wrapped condition expression. */
  wrappedCondition: string
  /** Already wrapped + addCondAttrToTemplate'd whenTrue HTML. */
  whenTrueTemplateHtml: string
  /** Already wrapped + addCondAttrToTemplate'd whenFalse HTML. */
  whenFalseTemplateHtml: string
  whenTrueArm: LoopChildArmPlan
  whenFalseArm: LoopChildArmPlan
}
