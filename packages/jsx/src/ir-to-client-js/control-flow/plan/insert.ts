/**
 * `InsertPlan` and arm-body Plan types.
 *
 * The Plan for a single `insert(scope, slotId, () => cond, trueArm, falseArm)`
 * runtime call. Nested conditionals nest as `InsertPlan` recursively in
 * `ArmBody.conditionals`, so one stringifier handles arbitrary depth.
 */

import type { BranchLoop } from '../../types'
import type { ScopeRef } from './common'

/**
 * Plan for a single `insert(scope, slotId, () => cond, trueArm, falseArm)`
 * call. `kind` is included so future dispatcher unions can narrow.
 */
export interface InsertPlan {
  kind: 'insert'
  /** Variable expression to use as the first argument of `insert(...)`. */
  scope: ScopeRef
  slotId: string
  /** The reactive condition expression. Wrapped at builder time. */
  condition: string
  /** Always two arms: [whenTrue, whenFalse]. */
  arms: [InsertArm, InsertArm]
  /**
   * Event-name normalizer applied to events inside arm bodies.
   * `'dom'` calls `toDomEventName` (drop "on" prefix, lowercase); `'raw'`
   * keeps the original event name (used by `@client` conditionals).
   */
  eventNameMode: 'dom' | 'raw'
}

/** A single branch arm of an insert(). */
export interface InsertArm {
  /** Pre-rendered HTML template string. Already includes the bf-cond-* markers. */
  templateHtml: string
  body: ArmBody
}

/**
 * Everything that happens inside `bindEvents: (__branchScope) => { ... }`.
 *
 * The order of fields matches the emission order (events → refs → child
 * components → disposable text effects → loop reconciliation → nested
 * conditionals). Stringifiers MUST follow this order to keep output stable.
 */
export interface ArmBody {
  /** addEventListener calls bound to elements inside the arm. */
  events: ArmEventBind[]
  /** Imperative ref callbacks for elements inside the arm. */
  refs: ArmRefBind[]
  /** initChild calls for child components materialized by the arm swap. */
  childComponents: ArmChildComponentInit[]
  /** Reactive text effects scoped to this branch. Each becomes `createDisposableEffect`. */
  textEffects: ArmTextEffect[]
  /**
   * Branch-scoped loops. Currently kept as raw `BranchLoop` references and
   * delegated to the legacy `emitBranchLoopBody` helper. A future PR will
   * turn them into `LoopPlan` and stringify directly.
   */
  loopsRaw: BranchLoop[]
  /**
   * Nested conditionals within this branch. Built recursively as `InsertPlan`s
   * so the same stringifier handles them at any depth.
   */
  conditionals: InsertPlan[]
}

export interface ArmEventBind {
  slotId: string
  eventName: string
  /** Handler source expression (already trimmed). The stringifier wraps it. */
  handler: string
}

export interface ArmRefBind {
  slotId: string
  callback: string
}

export interface ArmChildComponentInit {
  name: string
  slotId: string | null
  /** Pre-built props object expression (e.g., `{ get name() { return ... } }`). */
  propsExpr: string
}

export interface ArmTextEffect {
  slotId: string
  expression: string
}
