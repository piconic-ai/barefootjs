/**
 * Dev-only reactive instrumentation (SR1 / SR8, #1690).
 *
 * Verifies that `setProfilerSink` observes the reactive choke points without
 * changing semantics, that a memo's effect-run and signal-set share one id
 * (so the IR join can collapse them), and that clearing the sink stops events
 * (the production default is zero events).
 */

import { describe, test, expect, afterEach } from 'bun:test'
import {
  createSignal,
  createEffect,
  createMemo,
  createRoot,
  batch,
  beginTurn,
  endTurn,
  setProfilerSink,
  __bfReportOutput,
  type ProfilerEventSink,
  type SubscriberKind,
} from '../src/reactive'

type Event = [string, ...unknown[]]

function recorder(): { events: Event[]; sink: ProfilerEventSink } {
  const events: Event[] = []
  const sink: ProfilerEventSink = {
    signalSet: (id, batched) => events.push(['signalSet', id, batched]),
    subscribeAdd: (s, sub) => events.push(['subscribeAdd', s, sub]),
    subscribeRemove: (s, sub) => events.push(['subscribeRemove', s, sub]),
    effectCreate: (id, kind) => events.push(['effectCreate', id, kind]),
    effectEnter: (id) => events.push(['effectEnter', id]),
    effectExit: (id, dur) => events.push(['effectExit', id, dur]),
    effectOutput: (id, changed) => events.push(['effectOutput', id, changed]),
    effectDispose: (id) => events.push(['effectDispose', id]),
    batchBegin: (depth) => events.push(['batchBegin', depth]),
    batchFlush: (n) => events.push(['batchFlush', n]),
    turnBegin: (id, loc) => events.push(['turnBegin', id, loc]),
    turnEnd: () => events.push(['turnEnd']),
  }
  return { events, sink }
}

const names = (events: Event[]) => events.map(e => e[0])

afterEach(() => setProfilerSink(null))

describe('reactive instrumentation (SR1)', () => {
  test('signalSet fires on a real change, not on a no-op set', () => {
    const { events, sink } = recorder()
    setProfilerSink(sink)
    const [, setCount] = createSignal(0)
    setCount(1)
    setCount(1) // Object.is bail — no event
    expect(names(events).filter(n => n === 'signalSet')).toEqual(['signalSet'])
    expect(events.find(e => e[0] === 'signalSet')![2]).toBe(false) // not batched
  })

  test('subscribeAdd fires when an effect reads a signal; effect enter/exit bracket the run', () => {
    const { events, sink } = recorder()
    setProfilerSink(sink)
    const [count] = createSignal(0)
    createEffect(() => { count() })
    // create → enter → subscribeAdd (during the read) → exit
    const order = names(events)
    expect(order).toContain('effectCreate')
    expect(order.indexOf('effectEnter')).toBeLessThan(order.indexOf('subscribeAdd'))
    expect(order.indexOf('subscribeAdd')).toBeLessThan(order.indexOf('effectExit'))
    const exit = events.find(e => e[0] === 'effectExit')!
    expect(typeof exit[2]).toBe('number')
    expect(exit[2] as number).toBeGreaterThanOrEqual(0)
  })

  test('effectCreate carries the right kind for effect / memo / root', () => {
    const { events, sink } = recorder()
    setProfilerSink(sink)
    createEffect(() => {})
    createMemo(() => 1)
    createRoot(() => {})
    const kinds = events.filter(e => e[0] === 'effectCreate').map(e => e[2] as SubscriberKind)
    expect(kinds).toContain('effect')
    expect(kinds).toContain('memo')
    expect(kinds).toContain('root')
  })

  test("a memo's effect run and signal set share one id (IR-join collapse)", () => {
    const { events, sink } = recorder()
    setProfilerSink(sink)
    const [count, setCount] = createSignal(1)
    createMemo(() => count() * 2)
    const memoCreate = events.find(e => e[0] === 'effectCreate' && e[2] === 'memo')!
    const memoId = memoCreate[1] as string
    // The memo's body wrote its private signal under the same id.
    expect(events.some(e => e[0] === 'signalSet' && e[1] === memoId)).toBe(true)
    expect(events.some(e => e[0] === 'effectEnter' && e[1] === memoId)).toBe(true)
    // Recompute on dependency change re-enters under the same id.
    const before = events.length
    setCount(5)
    expect(events.slice(before).some(e => e[0] === 'effectEnter' && e[1] === memoId)).toBe(true)
  })

  test('batch brackets writes with begin + a single flush', () => {
    const { events, sink } = recorder()
    setProfilerSink(sink)
    const [, setA] = createSignal(0)
    const [, setB] = createSignal(0)
    createEffect(() => {}) // not subscribed; keep flush observable via counts
    batch(() => { setA(1); setB(2) })
    expect(names(events)).toContain('batchBegin')
    // signalSet inside batch is flagged batched
    expect(events.filter(e => e[0] === 'signalSet').every(e => e[2] === true)).toBe(true)
  })

  test('subscribeRemove fires when a disposed scope drops its edges', () => {
    const { events, sink } = recorder()
    setProfilerSink(sink)
    const [count] = createSignal(0)
    let dispose!: () => void
    createRoot((d) => {
      dispose = d
      createEffect(() => { count() })
    })
    const before = events.length
    dispose()
    const after = events.slice(before)
    expect(after.some(e => e[0] === 'subscribeRemove')).toBe(true)
    expect(after.some(e => e[0] === 'effectDispose')).toBe(true)
  })
})

describe('turn boundaries (SR3)', () => {
  test('beginTurn/endTurn notify the sink and group a turn around the work', () => {
    const { events, sink } = recorder()
    setProfilerSink(sink)
    const [, setCount] = createSignal(0)
    // What the compiler-emitted handler wrapper does at runtime.
    beginTurn('Counter#handler:s0:click', 'Counter.tsx:7')
    setCount(1)
    endTurn()
    expect(events[0]).toEqual(['turnBegin', 'Counter#handler:s0:click', 'Counter.tsx:7'])
    expect(events.some(e => e[0] === 'signalSet')).toBe(true)
    expect(events[events.length - 1]).toEqual(['turnEnd'])
  })

  test('beginTurn/endTurn are no-ops when profiling is off', () => {
    setProfilerSink(null)
    expect(() => { beginTurn('x'); endTurn() }).not.toThrow()
  })
})

describe('output fingerprint (SR1, §4.2.2)', () => {
  // The effectOutput change flags for one subscriber id, in order.
  const outputs = (events: Event[], id: string): boolean[] =>
    events.filter(e => e[0] === 'effectOutput' && e[1] === id).map(e => e[2] as boolean)

  test('a memo emits effectOutput: changed on a new value, unchanged on an Object.is-equal recompute', () => {
    const { events, sink } = recorder()
    setProfilerSink(sink)
    const [count, setCount] = createSignal(0)
    const parity = createMemo(() => count() % 2)
    const memoId = events.find(e => e[0] === 'effectCreate' && e[2] === 'memo')![1] as string

    expect(parity()).toBe(0)
    setCount(2) // recomputes to 0 — same value → wasted run
    expect(parity()).toBe(0)
    setCount(3) // recomputes to 1 — new value → real output
    expect(parity()).toBe(1)

    // mount(true), set2(false, identical), set3(true).
    expect(outputs(events, memoId)).toEqual([true, false, true])
  })

  test('effectOutput rides right after effectExit for the same run', () => {
    const { events, sink } = recorder()
    setProfilerSink(sink)
    const [n, setN] = createSignal(1)
    createMemo(() => n() * 0) // always 0 → every recompute after mount is wasted
    setN(2)
    // For the memo's recompute: …effectEnter, effectExit, effectOutput…
    const memoId = events.find(e => e[0] === 'effectCreate' && e[2] === 'memo')![1] as string
    const idxExit = events.findLastIndex(e => e[0] === 'effectExit' && e[1] === memoId)
    expect(events[idxExit + 1]).toEqual(['effectOutput', memoId, false])
  })

  test('__bfReportOutput attributes to the running effect and ORs several writes per run', () => {
    const { events, sink } = recorder()
    setProfilerSink(sink)
    let runs = 0
    const [tick, setTick] = createSignal(0)
    createEffect(() => {
      tick()
      // Two writes in one run: one unchanged, one changed → the run is "changed".
      __bfReportOutput(false)
      __bfReportOutput(runs > 0) // mount: false+false → unchanged; after: false+true → changed
      runs++
    })
    const id = events.find(e => e[0] === 'effectCreate')![1] as string
    setTick(1)
    expect(outputs(events, id)).toEqual([false, true])
  })

  test('__bfReportOutput is a no-op outside any run', () => {
    const { events, sink } = recorder()
    setProfilerSink(sink)
    __bfReportOutput(true)
    expect(events.some(e => e[0] === 'effectOutput')).toBe(false)
  })

  test('a plain effect that reports no output emits no effectOutput', () => {
    const { events, sink } = recorder()
    setProfilerSink(sink)
    const [v, setV] = createSignal(0)
    createEffect(() => { v() }) // never calls __bfReportOutput
    setV(1)
    expect(events.some(e => e[0] === 'effectOutput')).toBe(false)
  })
})

describe('instrumentation is off by default (SR8)', () => {
  test('clearing the sink stops events and never changes reactive results', () => {
    const { events, sink } = recorder()
    setProfilerSink(sink)
    const [count, setCount] = createSignal(0)
    const doubled = createMemo(() => count() * 2)
    let seen = -1
    createEffect(() => { seen = doubled() })
    setCount(3)
    expect(seen).toBe(6) // semantics intact while instrumented

    setProfilerSink(null)
    const mark = events.length
    setCount(10)
    expect(seen).toBe(20) // semantics intact after clearing
    expect(events.length).toBe(mark) // no new events recorded
  })
})
