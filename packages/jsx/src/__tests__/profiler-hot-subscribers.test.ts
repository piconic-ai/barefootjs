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

  test('ranks by cost (totalMs) — the most expensive first — and honors topN', () => {
    seq = 0
    // `a` costs more time though it runs fewer times; cost is what to fix.
    const events: ProfilerEvent[] = [
      ev('effectEnter', { subscriber: 'Calc#memo:a' }),
      ev('effectExit', { subscriber: 'Calc#memo:a', dur: 99 }), // expensive, 1 run
      ev('effectEnter', { subscriber: 'Calc#memo:b' }),
      ev('effectEnter', { subscriber: 'Calc#memo:b' }),
      ev('effectExit', { subscriber: 'Calc#memo:b', dur: 1 }), // cheap, 2 runs
    ]
    const r = analyzeHotSubscribers(events, index, { topN: 1 })
    expect(r.subscribers).toHaveLength(1)
    expect(r.subscribers[0].subscriber).toBe('Calc#memo:a') // 99ms > 1ms
  })

  test('minMs drops sub-threshold subscribers (--hot-ms noise floor)', () => {
    seq = 0
    // One costly subscriber and a long tail of cheap ones — `--hot-ms` keeps
    // only what is worth a fix.
    const events: ProfilerEvent[] = [
      ev('effectEnter', { subscriber: 'Calc#memo:a' }),
      ev('effectExit', { subscriber: 'Calc#memo:a', dur: 5 }),
      ev('effectEnter', { subscriber: 'Calc#memo:b' }),
      ev('effectExit', { subscriber: 'Calc#memo:b', dur: 0.04 }), // rounds to 0.0ms
    ]
    const r = analyzeHotSubscribers(events, index, { minMs: 1 })
    expect(r.subscribers).toHaveLength(1)
    expect(r.subscribers[0].subscriber).toBe('Calc#memo:a')
  })

  test('minMs and topN compose (filter floor, then cap)', () => {
    seq = 0
    const events: ProfilerEvent[] = [
      ev('effectEnter', { subscriber: 'Calc#memo:a' }),
      ev('effectExit', { subscriber: 'Calc#memo:a', dur: 10 }),
      ev('effectEnter', { subscriber: 'Calc#memo:b' }),
      ev('effectExit', { subscriber: 'Calc#memo:b', dur: 5 }),
      ev('effectEnter', { subscriber: 'Calc#memo:c' }),
      ev('effectExit', { subscriber: 'Calc#memo:c', dur: 0.01 }), // below floor
    ]
    const r = analyzeHotSubscribers(events, index, { minMs: 1, topN: 1 })
    expect(r.subscribers).toHaveLength(1)
    expect(r.subscribers[0].subscriber).toBe('Calc#memo:a')
  })

  test('same-cost subscribers tiebreak by runs then id — stable across timing noise', () => {
    seq = 0
    // Both round to the same displayed 0.1ms cost; runs (equal) then id decide.
    const mk = (durA: number, durB: number): ProfilerEvent[] => {
      seq = 0
      return [
        ev('effectEnter', { subscriber: 'Calc#memo:b' }),
        ev('effectExit', { subscriber: 'Calc#memo:b', dur: durB }),
        ev('effectEnter', { subscriber: 'Calc#memo:a' }),
        ev('effectExit', { subscriber: 'Calc#memo:a', dur: durA }),
      ]
    }
    // 0.41 and 0.44 both round to 0.4ms → same cohort → id breaks the tie.
    const order1 = analyzeHotSubscribers(mk(0.41, 0.44), index).subscribers.map(s => s.subscriber)
    const order2 = analyzeHotSubscribers(mk(0.44, 0.41), index).subscribers.map(s => s.subscriber)
    expect(order1).toEqual(order2) // timing flip within a cost bucket does not change rank
    expect(order1).toEqual(['Calc#memo:a', 'Calc#memo:b']) // id-sorted
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

  test('an uninstrumented `e<n>` id stays in the table, labelled with candidates (#1849 B6)', () => {
    seq = 0
    // `e1` is the runtime fallback id for a createEffect with no compiler
    // __bfId (one inside a ref callback — accordion/tabs/toast). Its cost is
    // real, so it must NOT be hidden; instead it is marked `uninstrumented` and
    // carries candidate source lines so the reader can jump to the likely call.
    const events: ProfilerEvent[] = [
      ev('effectEnter', { subscriber: 'e1' }),
      ev('effectExit', { subscriber: 'e1', dur: 5 }),
      ev('effectEnter', { subscriber: 'Calc#memo:a' }),
      ev('effectExit', { subscriber: 'Calc#memo:a', dur: 2 }),
    ]
    const candidates = [
      { file: 'collapsible/index.tsx', line: 82 },
      { file: 'collapsible/index.tsx', line: 126 },
    ]
    const r = analyzeHotSubscribers(events, index, { uninstrumentedCandidates: candidates })
    const e1 = r.subscribers.find(s => s.subscriber === 'e1')
    expect(e1).toBeDefined() // kept, not filtered
    expect(e1!.resolution).toBe('uninstrumented')
    expect(e1!.candidates).toEqual(candidates)
    // A real compiler id is unaffected — no uninstrumented marker.
    const memo = r.subscribers.find(s => s.subscriber === 'Calc#memo:a')!
    expect(memo.resolution).toBeUndefined()

    // The formatter relabels the location and lists the candidate lines (the
    // `e1` id still names the row in the label column).
    const out = formatHotSubscribers(r)
    expect(out).toContain('(uninstrumented — createEffect in non-JSX scope)')
    expect(out).toContain('candidates: collapsible/index.tsx:82, :126')
    // Exactly one pair of parens around the label — the `where` string and the
    // row formatter must not both add them (regression: `((uninstrumented …))`).
    expect(out).not.toContain('((')
  })

  test('caps the formatted list and summarizes the overflow', () => {
    seq = 0
    const events: ProfilerEvent[] = []
    for (let i = 0; i < 30; i++) {
      events.push(ev('effectEnter', { subscriber: `X#effect:${i}` }))
      events.push(ev('effectExit', { subscriber: `X#effect:${i}`, dur: 30 - i }))
    }
    const out = formatHotSubscribers(analyzeHotSubscribers(events, index), 12)
    // 12 shown + the "… and N more" summary line.
    expect(out).toContain('… and 18 more')
    expect((out.match(/\d+×/g) ?? []).length).toBe(12)
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
    expect(out).toMatch(/⚠ [\d.]+\/turn/) // hot note
    expect(out).toContain('█') // proportional bar
  })

  test('bars are proportional to cost (totalMs) — the costliest is the longest', () => {
    seq = 0
    const events: ProfilerEvent[] = [
      ev('effectEnter', { subscriber: 'Calc#memo:a' }),
      ev('effectExit', { subscriber: 'Calc#memo:a', dur: 8 }), // costly → ranked first, full bar
      ev('effectEnter', { subscriber: 'Calc#memo:b' }),
      ev('effectExit', { subscriber: 'Calc#memo:b', dur: 1 }), // cheap → short bar
    ]
    const lines = formatHotSubscribers(analyzeHotSubscribers(events, index)).split('\n').filter(l => l.includes('█'))
    const barLen = (l: string) => (l.match(/█/g) ?? []).length
    expect(barLen(lines[0])).toBeGreaterThan(barLen(lines[1]))
  })
})
