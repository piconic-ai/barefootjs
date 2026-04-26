/**
 * Plan types for inner loops emitted inside a composite loop's renderItem
 * body. Each `InnerLoopPlan` is one level (= one `mapArray` for reactive
 * inner loops, one `forEach` for static ones); `childLevels` recurses for
 * deeper nestings.
 *
 * Replaces the legacy `emitInnerLoopSetup` + `DepthLevel` walk. The
 * builder pre-resolves every per-level decision (mode, container query,
 * wrapped array / template / key, narrowed-outer-param children) so the
 * stringifier is a deterministic walk.
 */

import type { LoopChildEvent } from '../../types'
import type {
  IRLoopChildComponent,
  LoopParamBinding,
} from '../../../types'

/** A reactive text effect inside a reactive inner loop's renderItem body. */
export interface InnerLoopText {
  slotId: string
  /** Already wrapped via inner+outer loop param accessor (`wrapBoth`). */
  wrappedExpression: string
  /**
   * When true, the text's slot lives inside a conditional branch — the
   * stringifier emits a `createEffect` that re-queries `$t` on every run
   * (insert() may swap the text node).
   */
  insideConditional: boolean
}

/**
 * One inner loop level inside a composite renderItem.
 *
 * The `mode` discriminator selects the emission shape:
 *
 *   - `reactive`: full `mapArray(...)` with renderItem (template clone,
 *     key attr, components/events with inner-wrapped props, reactive text
 *     effects, recursive childLevels).
 *   - `static`: `forEach(...)` for setup-only (children are rendered
 *     into the SSR HTML); components/events use the raw param, no
 *     wrap, no template clone.
 *
 * Choosing the mode requires checking whether `inner.array` references
 * the outer loop param at *this* level (legacy O-8 fix). The builder
 * does that check; the stringifier just dispatches on `mode`.
 */
export interface InnerLoopPlan {
  /** Unique suffix used in `__ic` / `__innerEl` / `__innerIdx` var names. */
  uidSuffix: string
  /** Container resolution expression — already includes scope / selectors. */
  containerExpr: string
  /** Array expression as wrapped (reactive) or as written in source (static). */
  arrayExpr: string
  /**
   * The user's source `inner.array` text — used in the
   * `// Reactive inner loop: <array>` and
   * `// Initialize <array> loop components and events` comments.
   */
  arraySrc: string
  /** Inner loop parameter identifier (used by static forEach). */
  param: string
  /** Depth used by `keyAttrName(...)`. Same as the IR's `inner.depth`. */
  keyDepth: number
  /**
   * Per-mode emission data. Discriminator keeps each shape's required fields
   * narrowed and prevents accidental cross-talk.
   */
  emit: InnerLoopReactiveEmit | InnerLoopStaticEmit
  /** Recursive child levels — narrowed-outer-param at build time. */
  childLevels: readonly InnerLoopPlan[]
  /** Outer loop param threaded into emitComponentAndEventSetup. */
  outerLoopParam: string | undefined
  /** Outer loop param destructuring metadata. */
  outerLoopParamBindings?: readonly LoopParamBinding[]
}

export interface InnerLoopReactiveEmit {
  mode: 'reactive'
  /** keyFn source (output of `loopKeyFn(inner)`). */
  keyFn: string
  /** mapArray renderItem param head — `inner.param` or `__bfItem`. */
  paramHead: string
  /**
   * Body-entry statements emitted in order at the top of the renderItem
   * callback, before the `let __innerEl = ...` clone. Holds the optional
   * destructured-param unwrap and the (signal-accessor wrapped) inner
   * `.map()` callback preamble locals (#1052). Empty when neither applies.
   * Modeled as a list so the stringifier walks it deterministically
   * instead of branching on multiple independent emptiness checks.
   */
  preludeStatements: readonly string[]
  /** Already-wrapped HTML template for one inner-loop item. */
  wrappedTemplate: string
  /** Pre-wrapped key expression for setAttribute, or null when no key. */
  wrappedKey: string | null
  /** Inner-wrapped components for emitComponentAndEventSetup. */
  components: readonly IRLoopChildComponent[]
  /** Inner-wrapped events for emitComponentAndEventSetup. */
  events: readonly LoopChildEvent[]
  /** Pre-wrapped reactive text effects for the inner-item body. */
  reactiveTexts: readonly InnerLoopText[]
}

export interface InnerLoopStaticEmit {
  mode: 'static'
  /** Raw key expression (used as-is in setAttribute) — null when no key. */
  rawKey: string | null
  /**
   * Body-entry statements emitted in order at the top of the static
   * `forEach(...)` body, after the existence guard. Holds the inner
   * `.map()` callback preamble locals (#1064). Emitted unwrapped because
   * the forEach param is the literal item, not a signal accessor — no
   * accessor rewrite is needed. Empty when the source had no preamble.
   * Mirrors the reactive emit's `preludeStatements` shape (#1052/#1063).
   */
  preludeStatements: readonly string[]
  /** Raw components (no inner-wrap; the static body has no signal accessor). */
  components: readonly IRLoopChildComponent[]
  /** Raw events (no inner-wrap). */
  events: readonly LoopChildEvent[]
}

export type InnerLoopsPlan = readonly InnerLoopPlan[]
