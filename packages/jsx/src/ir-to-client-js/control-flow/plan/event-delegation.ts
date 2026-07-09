/**
 * `EventDelegationPlan` and `ItemLookup` Plan types.
 *
 * Covers three legacy emitters with one shape — they only differ in the
 * container variable and the per-event item-lookup strategy.
 */

import type { LoopChildEvent, LoopOffset, TopLevelLoop } from '../../types.ts'

/**
 * Plan for a loop's event-delegation block. Covers three legacy emitters:
 *   - `emitDynamicLoopEventDelegation` (top-level dynamic loop)
 *   - `emitBranchLoopEventDelegation`  (branch-scoped dynamic loop)
 *   - the inline delegation block at the end of `emitStaticArrayUpdates`
 *
 * The differences between the three contexts collapse onto two Plan fields:
 *   - `containerVar`: `_sN` (top), `__loop_cv` (branch), or `_sN` (static)
 *   - `itemLookup`: how to recover the loop item for an event target
 *
 * The delegation envelope itself (event grouping by name, deepest-first
 * sorting, capture vs bubble selection) is identical across contexts and
 * lives in the stringifier.
 */
export interface EventDelegationPlan {
  kind: 'event-delegation'
  containerVar: string
  events: LoopChildEvent[]
  itemLookup: ItemLookup
  /**
   * Profile mode (#1690, SR3): the owning component name. When set, the
   * stringifier brackets each delegated handler call with `beginTurn`/`endTurn`
   * (id `<Component>#handler:<childSlotId>:<eventName>`). Undefined when
   * profiling is off, so the emitted dispatcher is unchanged (SR8).
   */
  profileComponentName?: string
}

/**
 * How to look up the loop item from an event target. Each variant is the
 * deterministic result of (loop kind, has-key, has-bindings, has-nested-loops)
 * — flattening the matrix into discriminated cases.
 */
export type ItemLookup =
  | KeyedItemLookup
  | DynamicIndexItemLookup
  | StaticIndexItemLookup

export interface KeyedItemLookup {
  kind: 'keyed'
  /** Source array expression. */
  arrayExpr: string
  /** Loop param identifier (or destructure pattern text — used as receiver name only). */
  param: string
  /**
   * Loop index param name (e.g. `i` from `.map((item, i) => ...)`), or `null`
   * when the callback declares no index. When a delegated handler closes over
   * this name, the stringifier re-derives the index at dispatch time
   * (`arr.findIndex(...)`) and binds it so the reference resolves (#2189).
   */
  indexParam: string | null
  /** Destructured-binding metadata. Determines TDZ-safe `__bfLoopItem` shape (#951). */
  paramBindings: TopLevelLoop['paramBindings']
  /**
   * Key expression with the outer loop param substituted to `item` (so it can
   * appear inside `arr.find(item => String(KEY_WITH_ITEM) === key)`). Pre-computed
   * by the builder so the stringifier doesn't repeat the regex / substituteLoopBindings
   * decision.
   */
  keyWithItem: string
  /** Optional preamble line — emitted before the handler call. */
  mapPreamble: string | null
  /** True when `paramBindings` is non-empty — drives TDZ-safe lookup shape. */
  hasBindings: boolean
}

export interface DynamicIndexItemLookup {
  kind: 'dynamic-index'
  arrayExpr: string
  param: string
  mapPreamble: string | null
  hasBindings: boolean
  /** Loop index param name — see `KeyedItemLookup.indexParam` (#2189). */
  indexParam: string | null
}

export interface StaticIndexItemLookup {
  kind: 'static-index'
  arrayExpr: string
  param: string
  mapPreamble: string | null
  /** Loop index param name — see `KeyedItemLookup.indexParam` (#2189). */
  indexParam: string | null
  /**
   * Offset of the loop's items past its preceding container siblings. Its
   * terms are subtracted from the DOM child index to recover the array index,
   * so later `static + .map()` groups resolve the correct item (#1693).
   * `null` when nothing precedes the loop.
   */
  offset: LoopOffset | null
}
