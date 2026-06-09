/**
 * Batch advisor analysis (#1690, §4.2.3).
 *
 * Per turn, measures effect `totalRuns` vs `distinctSubscribers`; the gap is
 * what a `batch()` wrap would collapse. Measured half — every candidate is
 * `safety: 'unverified'` until the static oracle lands.
 */

import { describe, test, expect } from 'bun:test'
import { analyzeBatchAdvisor, formatBatchAdvisor, buildIdIndex, assessBatchSafety } from '../profiler'
import { buildComponentAnalysis } from '../debug'
import type { ProfilerEvent } from '@barefootjs/shared'

const SAFETY_SRC = `
  'use client'
  import { createSignal, createMemo } from '@barefootjs/client'
  export function C() {
    const [a, setA] = createSignal(0)
    const [b, setB] = createSignal(0)
    const sum = createMemo(() => a() + b())
    return <div></div>
  }
`
const safetyGraph = buildComponentAnalysis(SAFETY_SRC, 'C.tsx').graph

describe('assessBatchSafety (post-write-derived-read oracle, §4.2.3)', () => {
  const base = { hasIndirectSetters: false, graph: safetyGraph }

  test('writes only, no derived read → safe', () => {
    expect(assessBatchSafety({ ...base, handler: '() => { setA(1); setB(2) }', setterNames: ['setA', 'setB'], writtenSignals: ['a', 'b'] })).toBe('safe')
  })
  test('reads a downstream memo after a write → unsafe', () => {
    expect(assessBatchSafety({ ...base, handler: '() => { setA(1); console.log(sum()) }', setterNames: ['setA'], writtenSignals: ['a'] })).toBe('unsafe')
  })
  test('reads the memo before the write → safe', () => {
    expect(assessBatchSafety({ ...base, handler: '() => { const x = sum(); setA(x) }', setterNames: ['setA'], writtenSignals: ['a'] })).toBe('safe')
  })
  test('indirect setters (via a helper) → unverified', () => {
    expect(assessBatchSafety({ ...base, handler: '() => doStuff()', hasIndirectSetters: true, setterNames: ['setA'], writtenSignals: ['a'] })).toBe('unverified')
  })
  test('an unknown call after a write → unverified (could read a memo)', () => {
    expect(assessBatchSafety({ ...base, handler: '() => { setA(1); maybeReads() }', setterNames: ['setA'], writtenSignals: ['a'] })).toBe('unverified')
  })
})

let seq = 0
const ev = (type: ProfilerEvent['type'], f: Partial<ProfilerEvent> = {}): ProfilerEvent =>
  ({ type, seq: seq++, turn: null, ...f })

describe('analyzeBatchAdvisor', () => {
  test('savings = totalRuns - distinctSubscribers for a multi-write turn', () => {
    seq = 0
    // Turn t1: two writes (a, b) each re-run effects e1 and e2 → 4 runs, 2 distinct.
    const events: ProfilerEvent[] = [
      ev('signalSet', { signal: 'C#signal:a', turn: 't1' }),
      ev('signalSet', { signal: 'C#signal:b', turn: 't1' }),
      ev('effectEnter', { subscriber: 'C#effect:e1', turn: 't1' }),
      ev('effectEnter', { subscriber: 'C#effect:e2', turn: 't1' }),
      ev('effectEnter', { subscriber: 'C#effect:e1', turn: 't1' }),
      ev('effectEnter', { subscriber: 'C#effect:e2', turn: 't1' }),
    ]
    const r = analyzeBatchAdvisor(events)
    expect(r.candidates).toHaveLength(1)
    expect(r.candidates[0]).toMatchObject({
      turn: 't1', totalRuns: 4, distinctSubscribers: 2, writes: 2, savings: 2, safety: 'unverified',
    })
  })

  test('a single-write turn is never a candidate, however wide it fans out', () => {
    seq = 0
    // One `set()` repaints a 4-cell loop: one binding id, four runs. `batch()`
    // would collapse nothing (there is only one write), so this is not a
    // candidate — the pre-#1690 model wrongly read it as "saves 3".
    const events: ProfilerEvent[] = [
      ev('signalSet', { signal: 'Grid#signal:selected', turn: 't1' }),
      ev('effectEnter', { subscriber: 'Grid#binding:s9', turn: 't1' }),
      ev('effectEnter', { subscriber: 'Grid#binding:s9', turn: 't1' }),
      ev('effectEnter', { subscriber: 'Grid#binding:s9', turn: 't1' }),
      ev('effectEnter', { subscriber: 'Grid#binding:s9', turn: 't1' }),
    ]
    expect(analyzeBatchAdvisor(events).candidates).toHaveLength(0)
  })

  test('a turn where every effect runs once is not a candidate', () => {
    seq = 0
    const events: ProfilerEvent[] = [
      ev('signalSet', { signal: 'C#signal:a', turn: 't1' }),
      ev('signalSet', { signal: 'C#signal:b', turn: 't1' }),
      ev('effectEnter', { subscriber: 'C#effect:e1', turn: 't1' }),
      ev('effectEnter', { subscriber: 'C#effect:e2', turn: 't1' }),
    ]
    expect(analyzeBatchAdvisor(events).candidates).toHaveLength(0)
  })

  test('runs outside any turn are ignored', () => {
    seq = 0
    const events: ProfilerEvent[] = [
      ev('signalSet', { signal: 'C#signal:a' }), // turn null
      ev('signalSet', { signal: 'C#signal:b' }),
      ev('effectEnter', { subscriber: 'C#effect:e1' }), // turn null
      ev('effectEnter', { subscriber: 'C#effect:e1' }),
    ]
    expect(analyzeBatchAdvisor(events).candidates).toHaveLength(0)
  })

  test('ranks turns by savings descending', () => {
    seq = 0
    const events: ProfilerEvent[] = [
      // t1 saves 1 (two writes, e1 runs twice)
      ev('signalSet', { signal: 'C#signal:a', turn: 't1' }),
      ev('signalSet', { signal: 'C#signal:b', turn: 't1' }),
      ev('effectEnter', { subscriber: 'C#effect:e1', turn: 't1' }),
      ev('effectEnter', { subscriber: 'C#effect:e1', turn: 't1' }),
      // t2 saves 3 (two writes, e1 runs four times)
      ev('signalSet', { signal: 'C#signal:a', turn: 't2' }),
      ev('signalSet', { signal: 'C#signal:b', turn: 't2' }),
      ev('effectEnter', { subscriber: 'C#effect:e1', turn: 't2' }),
      ev('effectEnter', { subscriber: 'C#effect:e1', turn: 't2' }),
      ev('effectEnter', { subscriber: 'C#effect:e1', turn: 't2' }),
      ev('effectEnter', { subscriber: 'C#effect:e1', turn: 't2' }),
    ]
    const r = analyzeBatchAdvisor(events)
    expect(r.candidates.map(c => c.turn)).toEqual(['t2', 't1'])
    expect(r.candidates[0].savings).toBe(3)
  })

  test('resolves the handler turn id to source loc when given an id index', () => {
    seq = 0
    const src = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Form() {
        const [a, setA] = createSignal(0)
        const [b, setB] = createSignal(0)
        return <button onClick={() => { setA(1); setB(2) }}>{a() + b()}</button>
      }
    `
    const { graph } = buildComponentAnalysis(src, 'Form.tsx')
    const index = buildIdIndex(graph)
    // Find the handler turn id the compiler/runtime would emit for the button.
    const turn = [...index.keys()].find(k => k.startsWith('Form#handler:'))!
    expect(turn).toBeDefined()
    const events: ProfilerEvent[] = [
      ev('signalSet', { signal: 'Form#signal:a', turn }),
      ev('signalSet', { signal: 'Form#signal:b', turn }),
      ev('effectEnter', { subscriber: 'Form#binding:s0', turn }),
      ev('effectEnter', { subscriber: 'Form#binding:s0', turn }),
    ]
    const c = analyzeBatchAdvisor(events, index).candidates[0]
    expect(c.loc?.file).toBe('Form.tsx')
    expect(c.loc?.line).toBeGreaterThan(0)
    expect(formatBatchAdvisor(analyzeBatchAdvisor(events, index))).toMatch(/\(Form\.tsx:\d+\)/)
  })

  test('formats candidates and never claims safety in the measured half', () => {
    seq = 0
    const events: ProfilerEvent[] = [
      ev('signalSet', { signal: 'Checkout#signal:a', turn: 'Checkout#handler:s0:submit' }),
      ev('signalSet', { signal: 'Checkout#signal:b', turn: 'Checkout#handler:s0:submit' }),
      ev('effectEnter', { subscriber: 'C#effect:e1', turn: 'Checkout#handler:s0:submit' }),
      ev('effectEnter', { subscriber: 'C#effect:e1', turn: 'Checkout#handler:s0:submit' }),
    ]
    const out = formatBatchAdvisor(analyzeBatchAdvisor(events))
    expect(out).toContain('batch candidate 2→1')
    expect(out).toContain('safety unverified')
    expect(out).not.toContain(', safe)')
  })
})
