/**
 * Wasted re-runs analysis (#1690, §4.2.2).
 *
 * Pure over the SR2 stream's `effectOutput` fingerprints + SR4 id index: counts
 * runs that recomputed but produced output identical to the previous run, ranks
 * by removable cost, and joins each to source loc. Deterministic — same stream ⇒
 * same ranking.
 */

import { describe, test, expect } from 'bun:test'
import { analyzeWastedReReruns, buildIdIndex, formatWastedReReruns } from '../profiler'
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

const out = (subscriber: string, changed: boolean, turn: string | null = null): ProfilerEvent =>
  ev('effectOutput', { subscriber, changed, turn })

describe('analyzeWastedReReruns', () => {
  test('counts identical-output runs, computes ratio, and joins loc', () => {
    seq = 0
    const memo = 'Calc#memo:a'
    // 4 runs: first changed (real output), 3 identical → 3/4 wasted.
    const events: ProfilerEvent[] = [
      out(memo, true),
      out(memo, false),
      out(memo, false),
      out(memo, false),
    ]
    const r = analyzeWastedReReruns(events, index)
    expect(r.subscribers).toHaveLength(1)
    const top = r.subscribers[0]
    expect(top.subscriber).toBe(memo)
    expect(top.totalRuns).toBe(4)
    expect(top.wastedRuns).toBe(3)
    expect(top.wastedRatio).toBeCloseTo(0.75)
    expect(top.name).toBe('a')
    expect(top.kind).toBe('memo')
    expect(top.loc!.line).toBeGreaterThan(0)
    expect(top.wasted).toBe(true) // 0.75 ≥ default 0.5
  })

  test('subscribers with zero wasted runs are not findings', () => {
    seq = 0
    const events: ProfilerEvent[] = [out('Calc#memo:a', true), out('Calc#memo:a', true)]
    const r = analyzeWastedReReruns(events, index)
    expect(r.subscribers).toHaveLength(0)
  })

  test('wastedRatio threshold flags only subscribers at/above it', () => {
    seq = 0
    // a: 1/4 wasted (0.25); b: 3/4 wasted (0.75). At threshold 0.5 only b is flagged.
    const events: ProfilerEvent[] = [
      out('Calc#memo:a', true), out('Calc#memo:a', true), out('Calc#memo:a', true), out('Calc#memo:a', false),
      out('Calc#memo:b', false), out('Calc#memo:b', false), out('Calc#memo:b', false), out('Calc#memo:b', true),
    ]
    const r = analyzeWastedReReruns(events, index, { wastedRatio: 0.5 })
    const flagged = r.subscribers.filter(s => s.wasted).map(s => s.subscriber)
    expect(flagged).toEqual(['Calc#memo:b'])
    // both still appear as findings (each has ≥1 wasted run)
    expect(r.subscribers.map(s => s.subscriber).sort()).toEqual(['Calc#memo:a', 'Calc#memo:b'])
  })

  test('ranks by removable cost (wastedRuns), then ratio, then id — deterministic', () => {
    seq = 0
    // a: 2 wasted of 10 (0.2). b: 5 wasted of 10 (0.5). c: 5 wasted of 6 (~0.83).
    const mk = (id: string, wasted: number, total: number): ProfilerEvent[] => {
      const es: ProfilerEvent[] = []
      for (let i = 0; i < total; i++) es.push(out(id, i >= wasted))
      return es
    }
    const events = [...mk('Calc#memo:a', 2, 10), ...mk('Calc#memo:b', 5, 10), ...mk('Calc#memo:c', 5, 6)]
    const order = analyzeWastedReReruns(events, index).subscribers.map(s => s.subscriber)
    // b (5 wasted, 0.5) and c (5 wasted, 0.83) tie on wastedRuns → ratio breaks it → c first.
    expect(order).toEqual(['Calc#memo:c', 'Calc#memo:b', 'Calc#memo:a'])
  })

  test('honors topN after ranking', () => {
    seq = 0
    const events: ProfilerEvent[] = [
      out('Calc#memo:a', false), out('Calc#memo:a', false), // 2 wasted
      out('Calc#memo:b', false), // 1 wasted
    ]
    const r = analyzeWastedReReruns(events, index, { topN: 1 })
    expect(r.subscribers).toHaveLength(1)
    expect(r.subscribers[0].subscriber).toBe('Calc#memo:a')
  })

  test('runs without a fingerprint (no effectOutput) are not counted', () => {
    seq = 0
    // effectEnter/Exit without effectOutput → the run is unfingerprintable, ignored.
    const events: ProfilerEvent[] = [
      ev('effectEnter', { subscriber: 'Calc#memo:a' }),
      ev('effectExit', { subscriber: 'Calc#memo:a', dur: 3 }),
      out('Calc#memo:a', false),
    ]
    const r = analyzeWastedReReruns(events, index)
    expect(r.subscribers[0].totalRuns).toBe(1) // only the one effectOutput
    expect(r.subscribers[0].wastedRuns).toBe(1)
  })

  test('unresolved subscriber ids surface as coverage gaps, runs still counted', () => {
    seq = 0
    const ghost = 'Calc#effect:does-not-exist'
    const events: ProfilerEvent[] = [out(ghost, false), out(ghost, false)]
    const r = analyzeWastedReReruns(events, index)
    expect(r.subscribers[0].loc).toBeUndefined()
    expect(r.subscribers[0].wastedRuns).toBe(2)
    expect(r.unattributed.map(u => u.id)).toContain(ghost)
  })

  test('formats the priceLabel-style finding with a proportional bar and fix hint', () => {
    seq = 0
    const events: ProfilerEvent[] = []
    events.push(out('Calc#memo:a', true))
    for (let i = 0; i < 150; i++) events.push(out('Calc#memo:a', false))
    const txt = formatWastedReReruns(analyzeWastedReReruns(events, index))
    expect(txt).toContain('wasted re-runs')
    expect(txt).toMatch(/wasted: 150\/151 produced identical value/)
    expect(txt).toContain('█') // proportional bar
    expect(txt).toContain('split so it doesn') // fix hint on a flagged subscriber
  })

  test('empty stream formats a clean no-op report', () => {
    seq = 0
    const txt = formatWastedReReruns(analyzeWastedReReruns([], index))
    expect(txt).toContain('(no wasted re-runs recorded)')
  })
})
