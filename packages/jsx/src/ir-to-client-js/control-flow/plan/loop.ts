/**
 * Plan types for the four loop emission shapes.
 *
 * - `PlainLoopPlan`     — body is a plain element (no comp, no inner loop)
 * - `ComponentLoopPlan` — body is a single child component (with optional nested comps)
 * - `CompositeLoopPlan` — body is a plain element containing comps and/or inner loops
 * - `StaticLoopPlan`    — array is a constant literal; only reactive attrs/texts need setup
 *
 * The classification is documented in spec/compiler.md "Loop emission shapes".
 */

import type {
  LoopChildEvent,
  LoopChildReactiveAttr,
  LoopChildReactiveText,
  TopLevelLoop,
} from '../../types'
import type { IRLoopChildComponent } from '../../../types'
import type { DepthLevel } from '../legacy-helpers'
import type { ReactiveEffectsPassthrough } from './common'

/**
 * Plan for a top-level dynamic loop with a plain element body (no child
 * components, no inner loops). Covers `emitPlainElementLoopReconciliation`.
 *
 * The "single-line vs multi-line renderItem" split in the legacy emitter is
 * a stringifier concern, not a Plan concern — the Plan just records
 * whether reactive effects exist and the stringifier picks the layout.
 */
export interface PlainLoopPlan {
  kind: 'plain-loop'
  /** The container element variable, e.g. `_s1`. */
  containerVar: string
  /** Array expression to drive `mapArray(() => ARR, ...)`. Already chained (filter/sort). */
  arrayExpr: string
  /** Key function source — `null` when the loop has no explicit key. */
  keyFn: string
  /** renderItem param identifier (after destructure unwrap rename). */
  paramHead: string
  /** Index parameter identifier, e.g. `__idx` or user-supplied. */
  indexParam: string
  /** Statement to unwrap a destructured param at body entry. Empty when not needed. */
  paramUnwrap: string
  /** Pre-render preamble line (already wrapped with loop param accessor). Empty when none. */
  mapPreambleWrapped: string
  /** HTML template string for one item. */
  template: string
  /**
   * Carried IR fields for legacy `emitLoopChildReactiveEffects` passthrough.
   * `null` means there are no reactive effects; the stringifier emits the
   * single-line renderItem in that case. PR 5+ will replace this with
   * structured `ReactiveEffectsPlan`.
   */
  reactiveEffects: ReactiveEffectsPassthrough | null
}

/**
 * Plan for a top-level dynamic loop whose body is a single child component
 * (with or without nested child components inside it). Covers
 * `emitComponentLoopReconciliation`.
 *
 * `nestedComps.length === 0`  → emit the simple two-line renderItem
 *                               (initChild on existing, createComponent on new).
 * `nestedComps.length > 0`    → emit the SSR/CSR split that initialises both
 *                               the outer component and each nested child.
 *
 * Reactive-effects construction inside `childConditionals` is delegated to
 * the legacy `emitLoopChildReactiveEffects` via `ReactiveEffectsPassthrough`,
 * mirroring the PlainLoopPlan strategy.
 */
export interface ComponentLoopPlan {
  kind: 'component-loop'
  containerVar: string
  arrayExpr: string
  keyFn: string
  paramHead: string
  paramUnwrap: string
  indexParam: string
  /** The outer (loop body) component's name, e.g. `'Card'`. */
  componentName: string
  /** Pre-built props object expression for the outer component. */
  componentPropsExpr: string
  /** Wrapped key argument passed to `createComponent(name, props, KEY)`. */
  keyExpr: string
  /** Nested child component initialisers; empty for the simple case. */
  nestedComps: NestedComponentInit[]
  /** Carried IR for legacy reactive-effects passthrough; null when there's nothing to emit. */
  childConditionalEffects: ReactiveEffectsPassthrough | null
}

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
 * Plan for a composite loop — body is a plain element that contains either
 * nested child components (`outerComps`) and/or inner loops
 * (`depthLevels`). Used for both top-level emission
 * (`emitCompositeElementReconciliation`) and branch-scoped emission
 * (`emitCompositeBranchLoop`).
 *
 * The two contexts differ only in:
 *   - container variable name (`_sN` vs `__loop_cv`)
 *   - `arrayExpr` (top: chained filter/sort/map; branch: raw `loop.array`)
 *   - leading/body indent
 *   - `branchClearChildren`: when true, prepends a `getLoopChildren(...)
 *     .forEach(__el => __el.remove())` line so the branch swap starts from
 *     a clean slate (legacy parity).
 *
 * Inner-loop emission and component-and-event setup remain on the legacy
 * `emitInnerLoopSetup` / `emitComponentAndEventSetup` helpers, invoked from
 * the stringifier as a passthrough.
 */
export interface CompositeLoopPlan {
  kind: 'composite-loop'
  containerVar: string
  arrayExpr: string
  keyFn: string
  paramHead: string
  paramUnwrap: string
  indexParam: string
  /** Wrapped mapPreamble line, hoisted before the SSR/CSR split. Empty when none. */
  mapPreambleWrapped: string
  /** Inner template HTML for the loop body (single item). */
  template: string
  /** Outer-level child components (depth 0), with `insideConditional` ones already filtered out. */
  outerComps: readonly IRLoopChildComponent[]
  /** Outer-level child events (no nested-loop scope). */
  outerEvents: readonly LoopChildEvent[]
  /** Per-inner-loop levels for `emitInnerLoopSetup` passthrough. */
  depthLevels: readonly DepthLevel[]
  /** Loop param identifier — needed for legacy passthroughs. */
  loopParam: string
  /** Destructured-binding metadata for the loop param. */
  loopParamBindings: TopLevelLoop['paramBindings']
  /** Reactive effects rendered after the SSR/CSR split. */
  reactiveEffects: ReactiveEffectsPassthrough | null
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
}

/**
 * Plan for a top-level static array loop. A single `forEach` pass handles
 * both reactive attrs and reactive texts — mirrors the legacy
 * `emitStaticArrayUpdates` shape after the O-4 merge.
 */
export interface StaticLoopPlan {
  kind: 'static-loop'
  containerVar: string
  /** Source array expression as written in user code (no signal accessor wrap). */
  arrayExpr: string
  /** Loop param name. */
  param: string
  /** Index parameter identifier. */
  indexParam: string
  /** Children-index offset expression — index when no offset, `${idx} + N` otherwise. */
  childIndexExpr: string
  /**
   * Reactive attrs grouped by child slot id (preserves emission order).
   * Empty list means no attrs to emit.
   */
  attrsBySlot: ReadonlyArray<readonly [string, readonly LoopChildReactiveAttr[]]>
  /** Reactive texts in declaration order. */
  texts: readonly LoopChildReactiveText[]
}
