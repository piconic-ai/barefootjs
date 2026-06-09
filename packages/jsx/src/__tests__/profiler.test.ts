/**
 * Reactive performance profiler tests (#1690).
 *
 * Covers the run-free static analysis (SR5 budget, SR6 compile-diff), the SR4
 * id parse/join, and `buildProfileReport` — the dynamic report assembled from a
 * recorded SR2 event stream (the stream itself is produced by the CLI scenario
 * driver, tested separately).
 */

import { describe, test, expect } from 'bun:test'
import {
  buildStaticBudget,
  diffStaticBudget,
  formatStaticBudget,
  formatBudgetDiff,
  buildProfileReport,
  formatProfileReport,
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

  test('excludes event handlers from fan-out and subscriptions (they read, do not react)', () => {
    // `count` is read by the text binding (reactive) AND the onClick handler
    // (not reactive — runs outside any effect). Only the binding counts.
    const src = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function C() {
        const [count, setCount] = createSignal(0)
        return <button onClick={() => setCount(count() + 1)}>{count()}</button>
      }
    `
    const b = buildStaticBudget(src, 'C.tsx', 'C')
    const fan = b.fanOut.find(f => f.signal === 'count')!.subscribers
    // The text binding subscribes; the handler does not.
    expect(fan).toBe(1)
    expect(b.subscriptions).toBe(1)
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

  test('flags a compound component whose consumers live in composed children', () => {
    // Reactive state exists but nothing in *this* component reads it — the
    // signal/memo only drive composed child components (the Select/Combobox
    // shape). The single-component budget can't see across that boundary.
    const compound = `
      'use client'
      import { createSignal, createMemo } from '@barefootjs/client'
      import { Ctx } from './ctx'
      export function Picker(props: { value?: string }) {
        const [internal, setInternal] = createSignal('')
        const isControlled = createMemo(() => props.value !== undefined)
        return <Ctx value={{ internal, setInternal, isControlled }}>{props.children}</Ctx>
      }
    `
    const b = buildStaticBudget(compound, 'Picker.tsx', 'Picker')
    expect(b.signals).toBeGreaterThan(0)
    expect(b.subscriptions).toBe(0)
    expect(b.crossComponentOnly).toBe(true)
    expect(formatStaticBudget(b)).toContain('compound')
  })

  test('does not flag a self-contained component as compound', () => {
    const b = buildStaticBudget(counterSource, 'Counter.tsx', 'Counter')
    expect(b.crossComponentOnly).toBe(false)
    expect(formatStaticBudget(b)).not.toContain('compound')
  })

  test('a memo-only component whose memo is consumed in-component is not compound', () => {
    // No signals, so signal `subscriptions`/fan-out are 0 — but the memo IS
    // consumed by an in-component DOM binding, so this is self-contained, not a
    // compound component. The flag must span memo consumers, not just signals.
    const src = `
      'use client'
      import { createMemo } from '@barefootjs/client'
      export function Label(props: { x?: number }) {
        const label = createMemo(() => (props.x ?? 0) + 1)
        return <div>{label()}</div>
      }
    `
    const b = buildStaticBudget(src, 'Label.tsx', 'Label')
    expect(b.memos).toBe(1)
    expect(b.signals).toBe(0)
    expect(b.subscriptions).toBe(0)
    expect(b.crossComponentOnly).toBe(false)
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

  test('routes anonymous runtime ids to diagnostics, not the actionable gap list (#1840)', () => {
    const events = [
      // Compiler id the IR can't place → actionable gap.
      ev('effectEnter', { subscriber: 'Calc#effect:does-not-exist' }),
      // Anonymous runtime bookkeeping ids (no compiler __bfId) → non-actionable.
      ev('signalSet', { signal: 's9' }),
      ev('signalSet', { signal: 's10' }),
      ev('effectEnter', { subscriber: 'r10' }),
      ev('effectEnter', { subscriber: 'e3' }),
    ]
    const { joined, unattributed, diagnostics } = joinProfilerEvents(events, index)
    expect(joined).toHaveLength(5) // nothing dropped
    expect(unattributed.map(u => u.id)).toEqual(['Calc#effect:does-not-exist'])
    expect(diagnostics.map(u => u.id).sort()).toEqual(['e3', 'r10', 's10', 's9'])
  })
})

describe('buildProfileReport (dynamic, SR1–SR4 + analyses)', () => {
  const src = `
    'use client'
    import { createSignal, createMemo } from '@barefootjs/client'
    export function Calc() {
      const [count, setCount] = createSignal(0)
      const a = createMemo(() => count() * 2)
      return <button onClick={() => setCount(count() + 1)}>{a()}</button>
    }
  `
  let n = 0
  const ev = (type: ProfilerEvent['type'], f: Partial<ProfilerEvent> = {}): ProfilerEvent =>
    ({ type, seq: n++, turn: null, ...f })

  test('assembles hot subscribers, batch advisor, and coverage from a stream', () => {
    n = 0
    const events: ProfilerEvent[] = [
      ev('effectEnter', { subscriber: 'Calc#memo:a' }), // mount
      ev('effectOutput', { subscriber: 'Calc#memo:a', changed: true }), // mount: real output
      ev('turnBegin', { handlerId: 'Calc#handler:s0:click' }),
      ev('effectEnter', { subscriber: 'Calc#memo:a', turn: 'Calc#handler:s0:click' }),
      ev('effectExit', { subscriber: 'Calc#memo:a', dur: 2, turn: 'Calc#handler:s0:click' }),
      ev('effectOutput', { subscriber: 'Calc#memo:a', changed: false, turn: 'Calc#handler:s0:click' }), // wasted
      ev('turnEnd', {}),
    ]
    const r = buildProfileReport({ source: src, filePath: 'Calc.tsx', scenario: 'auto', events })
    expect(r.kind).toBe('profile')
    expect(r.componentName).toBe('Calc')
    expect(r.turns).toBe(1)
    expect(r.hotSubscribers.subscribers[0].name).toBe('a')
    expect(r.wastedReReruns.subscribers[0].name).toBe('a')
    expect(r.wastedReReruns.subscribers[0].wastedRuns).toBe(1)
    expect(r.coverage.handlersFired).toBe(1)
    expect(r.coverage.handlersTotal).toBeGreaterThanOrEqual(1)
    const out = formatProfileReport(r)
    expect(out).toContain('Calc — profile')
    expect(out).toContain('hot subscribers')
    expect(out).toContain('wasted re-runs')
    expect(out).toContain('coverage:')
  })

  test('a zero-turn report directs to the right tool', () => {
    n = 0
    // No handler events at all → no turns, no handlers.
    const noHandlerSrc = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Disp() { const [v] = createSignal(1); return <div>{v()}</div> }
    `
    const events: ProfilerEvent[] = [ev('effectEnter', { subscriber: 'Disp#binding:s0' })]
    const noHandlers = buildProfileReport({ source: noHandlerSrc, filePath: 'Disp.tsx', scenario: 'auto', events })
    expect(noHandlers.turns).toBe(0)
    expect(formatProfileReport(noHandlers)).toContain('no event handlers')
  })
})
