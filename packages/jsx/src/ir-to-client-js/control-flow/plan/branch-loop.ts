/**
 * Plan types for branch-scoped loops — those declared inside a conditional
 * branch arm of a top-level `InsertPlan` and emitted by `emitArmBody` via
 * `body.loopsRaw`.
 *
 * The plan discriminates on `kind`:
 *
 *   - `composite`: body contains child components and/or inner loops →
 *     reuses the existing `CompositeLoopPlan` shape (built by
 *     `buildBranchCompositePlan`).
 *   - `plain`: body is a plain element with no nested components/loops.
 *     Emits a disposable-effect-wrapped `mapArray` over the branch scope.
 *
 * Replaces the legacy `emitBranchLoopBody` + `emitBranchLoopEventDelegation`
 * pair.
 */

import type { CompositeLoopPlan } from './loop'
import type { EventDelegationPlan } from './event-delegation'
import type { ReactiveEffectsPlan } from './reactive-effects'

export interface BranchPlainLoopPlan {
  kind: 'plain'
  /**
   * Variable suffix for the container lookup — e.g. for slotId `s4` the
   * stringifier emits `__loop_s4` and queries via `$(__branchScope, 's4')`.
   */
  containerSlotId: string
  /** Container variable identifier — usually `__loop_<containerSlotId>`. */
  containerVar: string
  /** Loop array expression as written in source (no wrap). */
  arrayExpr: string
  /** keyFn source. */
  keyFn: string
  /** mapArray renderItem param head — `loop.param` or `__bfItem`. */
  paramHead: string
  /** Body-entry unwrap statement (empty when no destructured param). */
  paramUnwrap: string
  /** Index parameter identifier (e.g. `__idx`). */
  indexParam: string
  /** Pre-render preamble line — empty when not present. Already raw, no wrap. */
  mapPreambleRaw: string
  /** HTML template string for one item. */
  template: string
  /**
   * Reactive-effects plan for the renderItem body. Null when no reactive
   * effects (single-line renderItem); non-null forces the multi-line shape.
   */
  reactiveEffects: ReactiveEffectsPlan | null
  /** Event-delegation plan for branch-scoped event listeners. */
  eventDelegation: EventDelegationPlan
}

export interface BranchCompositeLoopPlan {
  kind: 'composite'
  /** The composite plan reused from the existing pipeline. */
  composite: CompositeLoopPlan
  /** Variable suffix used for the container lookup line. */
  containerSlotId: string
  /** Container variable identifier — usually `__loop_<containerSlotId>`. */
  containerVar: string
}

export type BranchLoopPlan = BranchPlainLoopPlan | BranchCompositeLoopPlan
