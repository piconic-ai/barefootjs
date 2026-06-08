/**
 * Profiler event wire contract (#1690, SR2).
 *
 * This is the shared shape between the *producer* (the client runtime's
 * `createRecordingSink`, which collects instrumentation into this log) and the
 * *consumer* (the `@barefootjs/jsx` analyses + SR4 IR join). It lives in
 * `@barefootjs/shared` — the leaf both packages depend on and which builds
 * first — so neither side owns the other's type and the jsx↔client peer
 * relationship stays free of a build-order cycle.
 *
 * Pure data: no runtime, dev-only by construction (only an instrumented run
 * ever produces these).
 */

/** Subscriber kinds the reactive instrumentation reports (SR1). */
export type ProfilerSubscriberKind = 'effect' | 'memo' | 'root'

/** The instrumentation points, as a discriminated `type` tag. */
export type ProfilerEventType =
  | 'signalSet'
  | 'subscribeAdd'
  | 'subscribeRemove'
  | 'effectCreate'
  | 'effectEnter'
  | 'effectExit'
  | 'effectOutput'
  | 'effectDispose'
  | 'batchBegin'
  | 'batchFlush'
  | 'turnBegin'
  | 'turnEnd'

/**
 * One normalized instrumentation event (SR2). Flat with optional fields rather
 * than a per-type union so the analyses can scan a homogeneous log; `type`
 * discriminates which fields are populated.
 */
export interface ProfilerEvent {
  type: ProfilerEventType
  /** Monotonic order of emission — stable across runs for a fixed scenario. */
  seq: number
  /** Handler id of the turn in scope when this fired, or `null` outside a turn. */
  turn: string | null
  /**
   * Unique invocation counter for the turn in scope — distinguishes repeated
   * invocations of the *same* handler (e.g. clicking several list rows, which
   * share a `turn` id) so per-turn metrics count interactions, not handler ids.
   * `null` outside a turn.
   */
  turnSeq: number | null
  /** Triggering signal id (`signalSet`) or the subscribed-to signal (`subscribe*`). */
  signal?: string
  /** The effect/memo id (`effect*`) or the subscriber side of a subscription. */
  subscriber?: string
  /** Effect run duration in ms (`effectExit` only). */
  dur?: number
  /**
   * Output fingerprint for the run (`effectOutput` only): `true` when the run
   * produced new output (a memo value that differs by `Object.is`, or a DOM
   * write that changed the node), `false` when the run recomputed but produced
   * output identical to its previous run — a *wasted* re-run (§4.2.2). Emitted
   * only for runs whose output is fingerprintable; a run with no `effectOutput`
   * event simply isn't counted by the wasted-re-runs analysis.
   */
  changed?: boolean
  /** Subscriber kind (`effectCreate` only). */
  kind?: ProfilerSubscriberKind
  /** Whether the set happened inside a `batch()` (`signalSet` only). */
  batched?: boolean
  /** Open batch depth (`batchBegin` only). */
  depth?: number
  /** Effects flushed by a batch (`batchFlush` only). */
  flushed?: number
  /** Turn handler id + optional source loc (`turnBegin` only). */
  handlerId?: string
  loc?: string
}
