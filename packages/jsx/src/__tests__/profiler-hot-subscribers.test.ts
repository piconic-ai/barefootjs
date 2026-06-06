/**
 * Hot subscribers analysis (#1690, §4.2.1).
 *
 * Pure over the SR2 event stream + SR4 id index: ranks effects/memos by total
 * run time, surfaces re-run pressure (`runsPerTurn`), and joins each to source
 * loc. Deterministic — same stream ⇒ same ranking.
 */

import { describe, test, expect } from 'bun:test'
import { analyzeHotSubscribers, buildIdIndex, formatHotSubscribers } from '../profiler'
import { buildComponentAnalysis } from '../debug'
import type { ProfilerEvent } from '@barefootjs/shared'

const source = `
  'use client'
  import { createSignal, createMemo, createEffect } from '@barefootjs/client'

  export function Calc() {
    const [count, setCount] = createSignal(0)
    const a = createMemo(() => count() * 2)
    createEffect(() => console.log(a()))
    return <button onClick={() => setCount(n => n + 1)}>{a()}</button>
  }
`

const { graph } = buildComponentAnalysis(source, 'Calc.tsx')
const index = buildIdIndex(graph)

let seq = 0
const ev = (type: ProfilerEvent['type'], f: Partial<ProfilerEvent> = {}): ProfilerEvent =>
  ({ type, seq: seq++, turn: null, ...f })

describe('analyzeHotSubscribers', () => {
  test('ranks by total ms, sums dur, counts runs, and joins loc', () => {
    seq = 0
    const memo = 'Calc#memo:a'
    const events: ProfilerEvent[] = [
      ev('effectEnter', { subscriber: memo, turn: 'Calc#handler:s0:click' }),
      ev('effectExit', { subscriber: memo, dur: 5, turn: 'Calc#handler:s0:click' }),
      ev('effectEnter', { subscriber: memo, turn: 'Calc#handler:s0:click' }),
      ev('effectExit', { subscriber: memo, dur: 7, turn: 'Calc#handler:s0:click' }),
    ]
    const r = analyzeHotSubscribers(events, index)
    expect(r.subscribers).toHaveLength(1)
    const top = r.subscribers[0]
    expect(top.subscriber).toBe(memo)
    expect(top.runs).toBe(2)
    expect(top.totalMs).toBe(12)
    expect(top.name).toBe('a')
    expect(top.kind).toBe('memo')
    expect(top.loc!.line).toBeGreaterThan(0)
  })

  test('runsPerTurn flags re-run pressure within a turn', () => {
    seq = 0
    const id = 'Calc#memo:a'
    // 3 runs, all in the same turn → 3 runs/turn → hot at default threshold 2.
    const events: ProfilerEvent[] = [
      ev('effectEnter', { subscriber: id, turn: 't1' }),
      ev('effectEnter', { subscriber: id, turn: 't1' }),
      ev('effectEnter', { subscriber: id, turn: 't1' }),
    ]
    const r = analyzeHotSubscribers(events, index)
    expect(r.subscribers[0].turns).toBe(1)
    expect(r.subscribers[0].runsPerTurn).toBe(3)
    expect(r.subscribers[0].hot).toBe(true)
  })

  test('mount runs (turn=null) are excluded from runsPerTurn, kept as mountRuns', () => {
    seq = 0
    const id = 'Calc#memo:a'
    // 1 mount run + 5 runs in one interaction turn = the worst case the e2e
    // surfaced: per-turn pressure is 5.0, not (6 runs / 2 buckets) = 3.0.
    const events: ProfilerEvent[] = [
      ev('effectEnter', { subscriber: id }), // mount (turn null)
      ev('effectEnter', { subscriber: id, turn: 't1' }),
      ev('effectEnter', { subscriber: id, turn: 't1' }),
      ev('effectEnter', { subscriber: id, turn: 't1' }),
      ev('effectEnter', { subscriber: id, turn: 't1' }),
      ev('effectEnter', { subscriber: id, turn: 't1' }),
    ]
    const top = analyzeHotSubscribers(events, index).subscribers[0]
    expect(top.runs).toBe(6)
    expect(top.mountRuns).toBe(1)
    expect(top.turns).toBe(1)
    expect(top.runsPerTurn).toBe(5)
    expect(top.hot).toBe(true)
  })

  test('a subscriber that only ran at mount has runsPerTurn 0 (not hot)', () => {
    seq = 0
    const id = 'Calc#memo:a'
    const events: ProfilerEvent[] = [ev('effectEnter', { subscriber: id })]
    const top = analyzeHotSubscribers(events, index).subscribers[0]
    expect(top.mountRuns).toBe(1)
    expect(top.turns).toBe(0)
    expect(top.runsPerTurn).toBe(0)
    expect(top.hot).toBe(false)
  })

  test('one run per turn across turns is not hot', () => {
    seq = 0
    const id = 'Calc#memo:a'
    const events: ProfilerEvent[] = [
      ev('effectEnter', { subscriber: id, turn: 't1' }),
      ev('effectEnter', { subscriber: id, turn: 't2' }),
    ]
    const r = analyzeHotSubscribers(events, index)
    expect(r.subscribers[0].runsPerTurn).toBe(1)
    expect(r.subscribers[0].hot).toBe(false)
  })

  test('ranks hottest-by-time first and honors topN', () => {
    seq = 0
    const events: ProfilerEvent[] = [
      ev('effectEnter', { subscriber: 'Calc#memo:a' }),
      ev('effectExit', { subscriber: 'Calc#memo:a', dur: 1 }),
      ev('effectEnter', { subscriber: 'Calc#signal:count' }), // not a real subscriber id but indexed
      ev('effectExit', { subscriber: 'Calc#signal:count', dur: 99 }),
    ]
    const r = analyzeHotSubscribers(events, index, { topN: 1 })
    expect(r.subscribers).toHaveLength(1)
    expect(r.subscribers[0].totalMs).toBe(99)
  })

  test('unresolved subscriber ids surface as coverage gaps, events not dropped', () => {
    seq = 0
    const ghost = 'Calc#effect:does-not-exist'
    const events: ProfilerEvent[] = [
      ev('effectEnter', { subscriber: ghost }),
      ev('effectExit', { subscriber: ghost, dur: 3 }),
    ]
    const r = analyzeHotSubscribers(events, index)
    expect(r.subscribers[0].loc).toBeUndefined()
    expect(r.subscribers[0].runs).toBe(1)
    expect(r.unattributed.map(u => u.id)).toContain(ghost)
  })

  test('formats a readable report with a hot note', () => {
    seq = 0
    const events: ProfilerEvent[] = [
      ev('effectEnter', { subscriber: 'Calc#memo:a', turn: 't1' }),
      ev('effectEnter', { subscriber: 'Calc#memo:a', turn: 't1' }),
      ev('effectExit', { subscriber: 'Calc#memo:a', dur: 4 }),
    ]
    const out = formatHotSubscribers(analyzeHotSubscribers(events, index))
    expect(out).toContain('hot subscribers')
    expect(out).toContain('runs/turn')
  })
})
