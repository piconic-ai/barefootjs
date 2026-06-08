/**
 * Reactive performance profiler — static half (SR5 budget, SR6 compile-diff).
 *
 * Covers the run-free parts of `bf debug profile` (#1690). The dynamic half
 * (--scenario / SR1–SR4) is specified in spec/profiler.md and not exercised
 * here; `buildProfileReport` is asserted to throw its pointer-to-spec error.
 */

import { describe, test, expect } from 'bun:test'
import {
  buildStaticBudget,
  diffStaticBudget,
  formatStaticBudget,
  formatBudgetDiff,
  buildProfileReport,
  parseProfilerId,
  buildIdIndex,
  joinProfilerEvents,
} from '../profiler'
import { buildComponentAnalysis } from '../debug'
import type { ProfilerEvent } from '@barefootjs/shared'

const memoChainSource = `
  'use client'
  import { createSignal, createMemo, createEffect } from '@barefootjs/client'

  export function Calc() {
    const [count, setCount] = createSignal(0)
    const a = createMemo(() => count() * 2)
    const b = createMemo(() => a() + 1)
    const c = createMemo(() => b() + 1)
    createEffect(() => console.log(c()))
    return <button onClick={() => setCount(n => n + 1)}>{c()}</button>
  }
`

const counterSource = `
  'use client'
  import { createSignal } from '@barefootjs/client'

  export function Counter() {
    const [count, setCount] = createSignal(0)
    return <button onClick={() => setCount(n => n + 1)}>Count: {count()}</button>
  }
`

describe('buildStaticBudget (SR5)', () => {
  test('counts reactive nodes and subscriptions', () => {
    const b = buildStaticBudget(counterSource, 'Counter.tsx', 'Counter')
    expect(b.kind).toBe('static-budget')
    expect(b.componentName).toBe('Counter')
    expect(b.signals).toBe(1)
    expect(b.memos).toBe(0)
    // The text binding `{count()}` subscribes to `count`.
    expect(b.subscriptions).toBeGreaterThan(0)
    expect(b.memoChainDepth).toBe(0)
  })

  test('measures the longest memo chain', () => {
    const b = buildStaticBudget(memoChainSource, 'Calc.tsx', 'Calc')
    expect(b.memos).toBe(3)
    expect(b.memoChainDepth).toBe(3)
    expect(b.memoChainLongest).toEqual(['a', 'b', 'c'])
  })

  test('reports per-signal fan-out, hottest first', () => {
    const b = buildStaticBudget(memoChainSource, 'Calc.tsx', 'Calc')
    const count = b.fanOut.find(f => f.signal === 'count')
    expect(count).toBeDefined()
    // count fans out through a → b → c → effect/text, i.e. several subscribers.
    expect(count!.subscribers).toBeGreaterThanOrEqual(3)
    // Sorted descending.
    for (let i = 1; i < b.fanOut.length; i++) {
      expect(b.fanOut[i - 1].subscribers).toBeGreaterThanOrEqual(b.fanOut[i].subscribers)
    }
  })

  test('honors the fan-out threshold for the hot flag', () => {
    const hot = buildStaticBudget(memoChainSource, 'Calc.tsx', 'Calc', { fanOutThreshold: 1 })
    expect(hot.fanOut.find(f => f.signal === 'count')!.hot).toBe(true)
    const cold = buildStaticBudget(memoChainSource, 'Calc.tsx', 'Calc', { fanOutThreshold: 999 })
    expect(cold.fanOut.every(f => f.hot === false)).toBe(true)
  })

  test('formats a human-readable budget', () => {
    const out = formatStaticBudget(buildStaticBudget(memoChainSource, 'Calc.tsx', 'Calc'))
    expect(out).toContain('static reactivity budget')
    expect(out).toContain('memo-chain depth: 3')
    expect(out).toContain('predictive only')
  })
})

describe('diffStaticBudget (SR6)', () => {
  test('flags an added memo + deeper chain as a regression', () => {
    const base = buildStaticBudget(counterSource, 'Counter.tsx', 'Counter')
    const head = buildStaticBudget(memoChainSource, 'Calc.tsx', 'Calc')
    const diff = diffStaticBudget(base, head)
    expect(diff.memos).toBe(3)
    expect(diff.memoChainDepth).toBe(3)
    expect(diff.regressed).toBe(true)
  })

  test('reports no regression for identical compiles', () => {
    const a = buildStaticBudget(memoChainSource, 'Calc.tsx', 'Calc')
    const b = buildStaticBudget(memoChainSource, 'Calc.tsx', 'Calc')
    const diff = diffStaticBudget(a, b)
    expect(diff.regressed).toBe(false)
    expect(formatBudgetDiff(diff)).toContain('no structural reactivity change')
  })
})

describe('parseProfilerId (SR4)', () => {
  test('splits <Component>#<kind>:<rest>', () => {
    expect(parseProfilerId('Calc#memo:doubled')).toEqual({ component: 'Calc', kind: 'memo', rest: 'doubled' })
  })
  test('keeps the full rest for controlled-effect ids', () => {
    expect(parseProfilerId('Calc#effect:controlled:setCount')).toEqual({
      component: 'Calc', kind: 'effect', rest: 'controlled:setCount',
    })
  })
  test('returns null for non-profiler strings', () => {
    expect(parseProfilerId('not-an-id')).toBeNull()
    expect(parseProfilerId('Calc#memo')).toBeNull()
  })
})

describe('buildIdIndex + joinProfilerEvents (SR4 join)', () => {
  const { graph } = buildComponentAnalysis(memoChainSource, 'Calc.tsx')
  const index = buildIdIndex(graph)

  const ev = (type: ProfilerEvent['type'], fields: Partial<ProfilerEvent> = {}): ProfilerEvent =>
    ({ type, seq: 0, turn: null, ...fields })

  test('indexes signals and memos by their compiler id, with source loc', () => {
    const sig = index.get('Calc#signal:count')
    expect(sig).toMatchObject({ kind: 'signal', name: 'count' })
    expect(sig!.loc.line).toBeGreaterThan(0)

    const memo = index.get('Calc#memo:a')
    expect(memo).toMatchObject({ kind: 'memo', name: 'a' })
  })

  test('indexes the controlled-signal sync effect under its setter', () => {
    expect(index.get('Calc#effect:controlled:setCount')).toMatchObject({ kind: 'effect' })
  })

  test('resolves an event stream to source-mapped nodes', () => {
    const events = [
      ev('signalSet', { signal: 'Calc#signal:count' }),
      ev('effectEnter', { subscriber: 'Calc#memo:a' }),
    ]
    const { joined, unattributed } = joinProfilerEvents(events, index)
    expect(joined[0].signal).toMatchObject({ kind: 'signal', name: 'count' })
    expect(joined[1].subscriber).toMatchObject({ kind: 'memo', name: 'a' })
    expect(unattributed).toHaveLength(0)
  })

  test('surfaces unresolved ids as a coverage gap, never dropping events', () => {
    const events = [
      ev('effectEnter', { subscriber: 'Calc#effect:does-not-exist' }),
      ev('effectExit', { subscriber: 'Calc#effect:does-not-exist', dur: 1 }),
    ]
    const { joined, unattributed } = joinProfilerEvents(events, index)
    expect(joined).toHaveLength(2) // events preserved
    expect(joined[0].subscriber).toBeUndefined()
    expect(unattributed).toEqual([{ id: 'Calc#effect:does-not-exist', count: 2 }])
  })
})

describe('buildProfileReport (dynamic seam, SR1–SR4)', () => {
  test('points at the spec until the substrate lands', () => {
    expect(() => buildProfileReport('./scenarios/x.ts')).toThrow(/spec\/profiler\.md/)
  })
})
