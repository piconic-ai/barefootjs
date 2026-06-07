/**
 * Batch advisor analysis (#1690, §4.2.3).
 *
 * Per turn, measures effect `totalRuns` vs `distinctSubscribers`; the gap is
 * what a `batch()` wrap would collapse. Measured half — every candidate is
 * `safety: 'unverified'` until the static oracle lands.
 */

import { describe, test, expect } from 'bun:test'
import { analyzeBatchAdvisor, formatBatchAdvisor, buildIdIndex } from '../profiler'
import { buildComponentAnalysis } from '../debug'
import type { ProfilerEvent } from '@barefootjs/shared'

let seq = 0
const ev = (type: ProfilerEvent['type'], f: Partial<ProfilerEvent> = {}): ProfilerEvent =>
  ({ type, seq: seq++, turn: null, ...f })

describe('analyzeBatchAdvisor', () => {
  test('savings = totalRuns - distinctSubscribers for a multi-write turn', () => {
    seq = 0
    // Turn t1: two writes each re-run effects e1 and e2 → 4 runs, 2 distinct.
    const events: ProfilerEvent[] = [
      ev('effectEnter', { subscriber: 'C#effect:e1', turn: 't1' }),
      ev('effectEnter', { subscriber: 'C#effect:e2', turn: 't1' }),
      ev('effectEnter', { subscriber: 'C#effect:e1', turn: 't1' }),
      ev('effectEnter', { subscriber: 'C#effect:e2', turn: 't1' }),
    ]
    const r = analyzeBatchAdvisor(events)
    expect(r.candidates).toHaveLength(1)
    expect(r.candidates[0]).toMatchObject({
      turn: 't1', totalRuns: 4, distinctSubscribers: 2, savings: 2, safety: 'unverified',
    })
  })

  test('a turn where every effect runs once is not a candidate', () => {
    seq = 0
    const events: ProfilerEvent[] = [
      ev('effectEnter', { subscriber: 'C#effect:e1', turn: 't1' }),
      ev('effectEnter', { subscriber: 'C#effect:e2', turn: 't1' }),
    ]
    expect(analyzeBatchAdvisor(events).candidates).toHaveLength(0)
  })

  test('runs outside any turn are ignored', () => {
    seq = 0
    const events: ProfilerEvent[] = [
      ev('effectEnter', { subscriber: 'C#effect:e1' }), // turn null
      ev('effectEnter', { subscriber: 'C#effect:e1' }),
    ]
    expect(analyzeBatchAdvisor(events).candidates).toHaveLength(0)
  })

  test('ranks turns by savings descending', () => {
    seq = 0
    const events: ProfilerEvent[] = [
      // t1 saves 1
      ev('effectEnter', { subscriber: 'C#effect:e1', turn: 't1' }),
      ev('effectEnter', { subscriber: 'C#effect:e1', turn: 't1' }),
      // t2 saves 3
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
      ev('effectEnter', { subscriber: 'C#effect:e1', turn: 'Checkout#handler:s0:submit' }),
      ev('effectEnter', { subscriber: 'C#effect:e1', turn: 'Checkout#handler:s0:submit' }),
    ]
    const out = formatBatchAdvisor(analyzeBatchAdvisor(events))
    expect(out).toContain('batch candidate 2→1')
    expect(out).toContain('safety unverified')
    expect(out).not.toContain(', safe)')
  })
})
