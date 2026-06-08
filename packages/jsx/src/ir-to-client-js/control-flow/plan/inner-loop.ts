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

import type { LoopChildEvent } from '../../types.ts'
import type {
  AttrMeta,
  IRLoopChildComponent,
  LoopParamBinding,
} from '../../../types.ts'
import type { LoopChildRefBinding } from './loop.ts'

/**
 * Body-entry statements emitted in order at the top of a `mapArray`
 * renderItem or static `forEach` body. Used by every nested-loop emission
 * point that needs to inject the inner `.map()` callback's preamble locals
 * (and, for reactive renderItems, the destructured-param unwrap).
 *
 * Empty array = no statements. The list shape lets the stringifier walk
 * deterministically instead of branching on multiple independent
 * emptiness checks (#1063 / #1064).
 */
export type PreludeStatements = readonly string[]

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
 * A reactive attribute effect inside a reactive inner loop's renderItem
 * body. Mirrors `InnerLoopText` for `style`, `data-*`, `className`,
 * etc. — every element in the loop body whose attribute reads a signal
 * (or the loop param) gets its own per-item `createEffect`.
 *
 * `attrName` is in JSX form (e.g. `className`, not `class`) — the
 * stringifier delegates to `emitAttrUpdate` which maps to HTML spelling.
 */
export interface InnerLoopReactiveAttr {
  slotId: string
  /** JSX attribute name (mapped to HTML spelling by `emitAttrUpdate`). */
  attrName: string
  /** Already wrapped via inner+outer loop param accessor. */
  wrappedExpression: string
  /** Pre-copied attr metadata used by `emitAttrUpdate`. */
  meta: AttrMeta
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
  /** Loop marker id — passed to mapArray so sibling loops disambiguate (#1087). */
  markerId: string
  /**
   * IR slot id for this inner loop (#1690, #1795 Phase 3). The loop node shares
   * its container element's slot, so this is `containerSlotId`. Used to emit the
   * `<Component>#binding:<slotId>` profile id on the inner `mapArray`; resolves
   * via the `loop` `domBinding`. `'?'` when the IR carried no slot.
   */
  slotId: string
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
   * Body-entry statements (see `PreludeStatements`) emitted at the top of
   * the renderItem callback, before the `let __innerEl = ...` clone.
   * Holds the optional destructured-param unwrap and the (signal-accessor
   * wrapped) inner `.map()` callback preamble locals (#1052).
   */
  preludeStatements: PreludeStatements
  /** Already-wrapped HTML template for one inner-loop item. */
  wrappedTemplate: string
  /**
   * True when the inner loop body is a multi-root JSX Fragment — drives
   * multi-root template clone + per-item marker emission inside the inner
   * mapArray's renderItem (#1212).
   */
  bodyIsMultiRoot: boolean
  /** Pre-wrapped key expression for setAttribute, or null when no key. */
  wrappedKey: string | null
  /** Inner-wrapped components for emitComponentAndEventSetup. */
  components: readonly IRLoopChildComponent[]
  /** Inner-wrapped events for emitComponentAndEventSetup. */
  events: readonly LoopChildEvent[]
  /** Pre-wrapped reactive text effects for the inner-item body. */
  reactiveTexts: readonly InnerLoopText[]
  /** Pre-wrapped reactive attribute effects for the inner-item body. */
  reactiveAttrs: readonly InnerLoopReactiveAttr[]
  /** Pre-wrapped imperative ref callbacks for the inner-item body (#1244). */
  childRefs: readonly LoopChildRefBinding[]
}

export interface InnerLoopStaticEmit {
  mode: 'static'
  /** Raw key expression (used as-is in setAttribute) — null when no key. */
  rawKey: string | null
  /**
   * Body-entry statements (see `PreludeStatements`) emitted at the top of
   * the static `forEach(...)` body, after the existence guard. Holds the
   * inner `.map()` callback preamble locals (#1064). Emitted unwrapped
   * because the forEach param is the literal item, not a signal accessor —
   * no accessor rewrite is needed.
   */
  preludeStatements: PreludeStatements
  /** Raw components (no inner-wrap; the static body has no signal accessor). */
  components: readonly IRLoopChildComponent[]
  /** Raw events (no inner-wrap). */
  events: readonly LoopChildEvent[]
  /** Imperative ref callbacks (unwrapped — static body has no signal accessor). */
  childRefs: readonly LoopChildRefBinding[]
}

export type InnerLoopsPlan = readonly InnerLoopPlan[]
