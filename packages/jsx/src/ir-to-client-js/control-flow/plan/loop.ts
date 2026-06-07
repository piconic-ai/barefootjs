/**
 * The unified Plan type for every loop emission shape (#1253).
 *
 * `LoopPlan` is a single discriminated union keyed by `kind`. The four
 * legacy interfaces (`PlainLoopPlan`, `ComponentLoopPlan`,
 * `CompositeLoopPlan`, `StaticLoopPlan`) have been collapsed into the
 * `'plain'` / `'component'` / `'composite'` / `'static'` variants below.
 *
 * Per-item reactive concepts (attrs, texts, conditionals, multi-root
 * cloning, `qsa` vs `qsaItem` slot lookup) live in shared fields on the
 * dynamic-loop base. Variant-specific fields stay under the discriminator
 * so dispatch in stringifiers narrows correctly.
 *
 * Classification semantics are documented in spec/compiler.md
 * "Loop emission shapes" and validated by the decision-tree fixtures in
 * `__tests__/loop-plan-classification.test.ts`.
 */

import type {
  LoopChildEvent,
  LoopChildReactiveAttr,
  LoopChildReactiveText,
  TopLevelLoop,
} from '../../types.ts'
import type { IRLoopChildComponent } from '../../../types.ts'
import type { ReactiveEffectsPlan } from './reactive-effects.ts'
import type { InnerLoopsPlan } from './inner-loop.ts'

/** Fields shared by every `LoopPlan` variant. */
interface LoopPlanCommon {
  /** Container element variable (e.g. `_s1` for top-level, `__loop_<cv>` for branch). */
  containerVar: string
  /** Array expression to drive iteration. Pre-chained (filter/sort) for top-level dynamic loops. */
  arrayExpr: string
  /** Index parameter identifier, e.g. `__idx` or user-supplied. */
  indexParam: string
  /**
   * Imperative ref callbacks on elements inside the loop body (#1244).
   * Required on every variant so refs cannot be silently dropped when a
   * new loop shape lands. Each `wrappedCallback` is already wrapped with
   * the loop-param accessor; the stringifier looks up the target via
   * `qsa(__el, '[bf="<slot>"]')` (or `qsaItem` for multi-root bodies)
   * and invokes the callback on every renderItem / forEach invocation
   * — initial mount, SSR hydration, and same-key remount after unmount.
   */
  childRefs: readonly LoopChildRefBinding[]
}

/** Fields shared by every dynamic (`mapArray`-driven) loop variant. */
interface DynamicLoopCommon extends LoopPlanCommon {
  /** Loop marker id — passed to mapArray so sibling loops disambiguate (#1087). */
  markerId: string
  /**
   * Profile mode (#1690, SR4): the loop's binding id
   * (`<Component>#binding:<slotId>`), passed to `mapArray` as the `bfId` so its
   * internal reconcile effect — typically the costliest subscriber in a list —
   * is attributed to source. Undefined when profiling is off.
   */
  profileLoopId?: string
  /** Key function source — `null` when the loop has no explicit key. */
  keyFn: string
  /** renderItem param identifier (after destructure unwrap rename). */
  paramHead: string
  /** Statement to unwrap a destructured param at body entry. Empty when not needed. */
  paramUnwrap: string
}

/** Per-item ref callback resolved against a child slot for emission (#1244). */
export interface LoopChildRefBinding {
  /** bf slot ID of the target element (root or descendant of the body). */
  childSlotId: string
  /**
   * Callback expression as emitted into the renderItem / forEach body.
   *
   * For dynamic loops (`mapArray`-driven) the callback is wrapped via
   * `wrapLoopParamAsAccessor` so bare loop-param references resolve
   * through the per-item signal accessor. For static loops (forEach over
   * a raw array) the callback is passed through unwrapped — the forEach
   * binds the param as the raw value, so wrapping would rewrite `item.x`
   * to `item().x` and throw at runtime. Mirrors how `reactiveTexts` /
   * `reactiveAttrs` are already handled on the static path.
   */
  callback: string
}

/**
 * Plain element body, no child components, no inner loops. Covers the
 * single-line and multi-line renderItem shapes — the stringifier picks
 * the layout based on `reactiveEffects` and `bodyIsMultiRoot`.
 */
interface PlainLoopVariant extends DynamicLoopCommon {
  kind: 'plain'
  /** Pre-render preamble line (already wrapped with loop param accessor). Empty when none. */
  mapPreambleWrapped: string
  /** HTML template string for one item. */
  template: string
  /** Resolved reactive-effects plan — null forces the single-line renderItem shape. */
  reactiveEffects: ReactiveEffectsPlan | null
  /**
   * True when the loop body is a multi-root JSX Fragment. Forces the
   * multi-line renderItem layout, multi-root template clone, per-item
   * `<!--bf-loop-i-->` marker emission, and `qsaItem` slot lookups (#1212).
   */
  bodyIsMultiRoot: boolean
  /**
   * True when the loop body is a whole-item conditional (#1665). Switches
   * emission to `mapArrayAnchored`: the renderItem returns a fragment headed
   * by a `<!--bf-loop-i:KEY-->` anchor and seeded with the conditional's
   * markers, and `insert(anchor, …)` (not `insert(__el, …)`) owns the
   * possibly-empty content.
   */
  anchored: boolean
  /**
   * Key expression wrapped as a loop-param accessor (`t().id`), used to bake
   * the per-item `bf-loop-i:KEY` anchor value inside the anchored renderItem.
   * Empty when the loop has no key (only meaningful when `anchored`).
   */
  anchorKeyExpr: string
}

/**
 * Loop body is a single child component (with or without nested child
 * components inside it).
 *
 * `nestedComps.length === 0`  → simple two-line renderItem.
 * `nestedComps.length > 0`    → SSR/CSR split that initialises both the
 *                               outer component and each nested child.
 *
 * `childConditionalEffects` is non-null when the body contains reactive
 * conditionals; same plan shape as plain/composite `reactiveEffects`.
 */
interface ComponentLoopVariant extends DynamicLoopCommon {
  kind: 'component'
  /** The outer (loop body) component's name. */
  componentName: string
  /** Pre-built props object expression for the outer component. */
  componentPropsExpr: string
  /** Wrapped key argument passed to `createComponent(name, props, KEY)`. */
  keyExpr: string
  /** Nested child component initialisers; empty for the simple case. */
  nestedComps: NestedComponentInit[]
  /** Reactive-effects plan for `childConditionals` inside the loop body. */
  childConditionalEffects: ReactiveEffectsPlan | null
}

/**
 * Composite — body is a plain element that contains nested child components
 * (`outerComps`) and/or inner loops (`innerLoops`). Used for both top-level
 * emission and branch-scoped emission. The two contexts differ only in
 * container variable name, array expression chaining, indentation, and
 * whether `branchClearChildren` is set.
 */
interface CompositeLoopVariant extends DynamicLoopCommon {
  kind: 'composite'
  /** Wrapped mapPreamble line, hoisted before the SSR/CSR split. Empty when none. */
  mapPreambleWrapped: string
  /** Inner template HTML for the loop body (single item). */
  template: string
  /** Outer-level child components (depth 0), with `insideConditional` ones already filtered out. */
  outerComps: readonly IRLoopChildComponent[]
  /** Outer-level child events (no nested-loop scope). */
  outerEvents: readonly LoopChildEvent[]
  /** Per-inner-loop plans (one per top-level depth, recursive via childLevels). */
  innerLoops: InnerLoopsPlan
  /** Loop param identifier — needed for legacy passthroughs. */
  loopParam: string
  /** Destructured-binding metadata for the loop param. */
  loopParamBindings: TopLevelLoop['paramBindings']
  /** Reactive effects rendered after the SSR/CSR split. */
  reactiveEffects: ReactiveEffectsPlan | null
  /**
   * When true, the stringifier prepends a `getLoopChildren(...).forEach(__el
   * => __el.remove())` line — branch composite loops need this so mapArray
   * starts from a clean container after a branch swap. Top-level loops do not.
   */
  branchClearChildren: boolean
  /** Indent of the `mapArray(` line itself. */
  topIndent: string
  /** Indent of the lines inside the renderItem body. */
  bodyIndent: string
  /**
   * True when the loop body is a multi-root JSX Fragment — drives the
   * multi-root template clone, per-item marker emission, and
   * `qsa(__el, ...)` → `qsaItem(__el, ...)` for reactive lookups (#1212).
   */
  bodyIsMultiRoot: boolean
}

/**
 * Top-level static array. A single `forEach` pass handles both reactive
 * attrs and reactive texts — mirrors the legacy `emitStaticArrayUpdates`
 * shape after the O-4 merge.
 */
interface StaticLoopVariant extends LoopPlanCommon {
  kind: 'static'
  /** Loop param name (the forEach callback's first arg). */
  param: string
  /** Children-index offset expression — index when no offset, `${idx} + N` otherwise. */
  childIndexExpr: string
  /** Reactive attrs grouped by child slot id (preserves emission order). */
  attrsBySlot: ReadonlyArray<readonly [string, readonly LoopChildReactiveAttr[]]>
  /** Reactive texts in declaration order. */
  texts: readonly LoopChildReactiveText[]
  /**
   * CSR self-heal payload (#1247). Set when the loop's array expression
   * references an init-scope local that the CSR template substitutes with
   * `[]` — without these, the container is empty on a CSR-only mount.
   * Null for the SSR-then-hydrate-only common case.
   */
  csrMaterialize: StaticLoopMaterializePlan | null
}

/**
 * The unified Plan for every loop emission shape. Stringifiers narrow on
 * `kind`; builders return this type from a single entry point.
 */
export type LoopPlan =
  | PlainLoopVariant
  | ComponentLoopVariant
  | CompositeLoopVariant
  | StaticLoopVariant

/**
 * Helpers for callers that need a specific variant. Prefer these over
 * hand-rolled `Extract<LoopPlan, ...>` so the kind keys stay in one place.
 */
export type PlainLoopPlan = Extract<LoopPlan, { kind: 'plain' }>
export type ComponentLoopPlan = Extract<LoopPlan, { kind: 'component' }>
export type CompositeLoopPlan = Extract<LoopPlan, { kind: 'composite' }>
export type StaticLoopPlan = Extract<LoopPlan, { kind: 'static' }>

/**
 * One nested child component to initialise inside a renderItem body.
 * `childrenTextEffect` is non-null when the component's children are
 * text-equivalent AND reference the outer loop param — in that case the
 * stringifier emits a `createEffect` that updates the child's `textContent`.
 */
export interface NestedComponentInit {
  componentName: string
  /** CSS selector used by `qsa(...)` to find the SSR-rendered placeholder. */
  selector: string
  /** Pre-built props object expression for the nested component. */
  propsExpr: string
  /** When non-null, emit a reactive textContent effect alongside `initChild`. */
  childrenTextEffect: { wrappedChildren: string } | null
}

/**
 * Inputs the stringifier needs to clone one per-iteration element on the
 * CSR fallback path. Stored as a sub-plan so the SSR-then-hydrate static
 * loop emission doesn't pay the bytes for it.
 */
export interface StaticLoopMaterializePlan {
  /** Per-iteration HTML template with raw param references (no `__bfItem()` wrap). */
  itemTemplate: string
  /**
   * Pre-template statements that must run inside the forEach body (e.g. the
   * `const reacted = ...` preamble from a `.map(item => { ... return <jsx/> })`
   * block form). Empty when the loop callback was an expression-bodied arrow.
   */
  mapPreamble: string
  /**
   * True when the loop body is a multi-root JSX Fragment; the stringifier
   * uses `emitMultiRootTemplateCloneLines` so every per-iteration sibling
   * lands in the right place.
   */
  bodyIsMultiRoot: boolean
}
