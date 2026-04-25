/**
 * Plan types for the control-flow emitter.
 *
 * The control-flow emission pipeline is being migrated from "IR → string[]"
 * directly to "IR → Plan → string[]". This file holds the Plan IR.
 *
 * Plans are pure data — no string templates, no `lines.push`. Every emission
 * decision (which scope to query, which event-name normalizer to use, etc.)
 * is made by the builder; the stringifier is a deterministic function from
 * Plan to source text.
 *
 * Migration status (2026-04-25):
 * - PR 1: `InsertPlan` for top-level + nested conditionals.
 * - PR 2: `LoopPlan` (plain → component → composite).
 * - PR 3: `EventDelegationPlan`.
 *
 * Until PR 2 lands, ArmBody.loops is a passthrough escape hatch — see the
 * field comment on `ArmBody.loopsRaw` below.
 */

import type {
  BranchLoop,
  ConditionalElement,
  LoopChildConditional,
} from '../../types'

// ─────────────────────────────────────────────────────────────────────
// Top-level
// ─────────────────────────────────────────────────────────────────────

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
   * Branch-scoped loops. PR 1 keeps these as raw `BranchLoop` references and
   * delegates back to the legacy `emitBranchLoopBody` helper. PR 2 will turn
   * them into `LoopPlan` and stringify directly.
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

// ─────────────────────────────────────────────────────────────────────
// Scope references
// ─────────────────────────────────────────────────────────────────────

/**
 * The scope variable to pass as the first argument of insert(...) /
 * mapArray(...). At top-level this is `__scope`; nested inside an arm body
 * it is `__branchScope`; nested inside a loop renderItem it is the loop
 * element variable (e.g. `__el`).
 */
export type ScopeRef =
  | { kind: 'top' }                         // emits `__scope`
  | { kind: 'branchScope' }                 // emits `__branchScope`
  | { kind: 'var'; name: string }           // emits the literal variable name

// ─────────────────────────────────────────────────────────────────────
// Re-export legacy types referenced from Plan-level code paths.
// PR 2 will drop these once builder coverage is complete.
// ─────────────────────────────────────────────────────────────────────

export type { ConditionalElement, LoopChildConditional, BranchLoop }
