/**
 * Profiler event collection (#1690, SR2).
 *
 * The reactive runtime (`reactive.ts`) reports raw instrumentation through a
 * `ProfilerEventSink` (SR1). This module turns that callback stream into a
 * flat, ordered, **turn-stamped** event log — the normalized SR2 contract the
 * analyses (hot subscribers / wasted re-runs / batch advisor) and the SR4 IR
 * join consume.
 *
 * The collector is the one place that knows the *current turn*: it tracks the
 * `beginTurn`/`endTurn` stack (SR3) and stamps every event with the handler id
 * in scope when it fired, so per-turn metrics (batch savings, runs/turn) need
 * no microtask guesswork.
 *
 * Dev-only (SR8): nothing here runs unless `setProfilerSink` is handed a
 * recording sink, which only the instrumented/profile build does.
 */

import type { ProfilerEventSink } from "./reactive.ts"
import type { ProfilerEvent } from '@barefootjs/shared'

// The event wire contract lives in `@barefootjs/shared` (built first, depended
// on by both this runtime and the jsx analyses) — see that module for why.
export type { ProfilerEvent, ProfilerEventType } from '@barefootjs/shared'

export interface RecordingSink {
  /** The sink to hand to `setProfilerSink(...)`. */
  sink: ProfilerEventSink
  /** The collected event log, in emission order. */
  events: ProfilerEvent[]
  /** Clear the log and the internal turn stack (start a fresh scenario). */
  reset(): void
}

/**
 * Build a recording sink (SR2). Hand `.sink` to `setProfilerSink`, drive a
 * scenario, then read `.events` — a turn-stamped, ordered log ready for the
 * SR4 join and the analyses. Turns may nest (a handler that dispatches another
 * handler); the stack's top is the attributed turn.
 */
export function createRecordingSink(): RecordingSink {
  const events: ProfilerEvent[] = []
  const turnStack: string[] = []
  let seq = 0

  const currentTurn = (): string | null =>
    turnStack.length > 0 ? turnStack[turnStack.length - 1] : null

  const push = (e: Omit<ProfilerEvent, 'seq' | 'turn'>): void => {
    events.push({ seq: seq++, turn: currentTurn(), ...e })
  }

  const sink: ProfilerEventSink = {
    signalSet: (id, batched) => push({ type: 'signalSet', signal: id, batched }),
    subscribeAdd: (signal, subscriber) => push({ type: 'subscribeAdd', signal, subscriber }),
    subscribeRemove: (signal, subscriber) => push({ type: 'subscribeRemove', signal, subscriber }),
    effectCreate: (id, kind) => push({ type: 'effectCreate', subscriber: id, kind }),
    effectEnter: (id) => push({ type: 'effectEnter', subscriber: id }),
    effectExit: (id, dur) => push({ type: 'effectExit', subscriber: id, dur }),
    effectDispose: (id) => push({ type: 'effectDispose', subscriber: id }),
    batchBegin: (depth) => push({ type: 'batchBegin', depth }),
    batchFlush: (flushed) => push({ type: 'batchFlush', flushed }),
    turnBegin: (handlerId, loc) => {
      // Record before pushing so the marker carries the *parent* turn, then
      // open the new turn for everything that follows.
      push({ type: 'turnBegin', handlerId, loc })
      turnStack.push(handlerId)
    },
    turnEnd: () => {
      turnStack.pop()
      push({ type: 'turnEnd' })
    },
  }

  return {
    sink,
    events,
    reset() {
      events.length = 0
      turnStack.length = 0
      seq = 0
    },
  }
}
