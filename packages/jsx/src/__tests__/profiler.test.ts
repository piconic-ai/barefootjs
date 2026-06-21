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
  PROFILE_SCHEMA_VERSION,
  buildStaticBudget,
  diffStaticBudget,
  formatStaticBudget,
  formatBudgetDiff,
  buildProfileReport,
  formatProfileReport,
  parseProfilerId,
  buildIdIndex,
  joinProfilerEvents,
  findUninstrumentedEffects,
  evaluateProfileGates,
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

  test('splits fan-out into direct vs via-memo and keys `hot` off direct', () => {
    // count → a → b → c → {effect, text}: exactly ONE direct subscriber (memo
    // a); the rest are reached only through memo barriers.
    const b = buildStaticBudget(memoChainSource, 'Calc.tsx', 'Calc')
    const count = b.fanOut.find(f => f.signal === 'count')!
    expect(count.direct).toBe(1)
    expect(count.subscribers).toBeGreaterThanOrEqual(4)
    // The transitive total clears a threshold of 3, but direct (1) does not — so
    // the signal is NOT hot. `hot` tracks real per-write pressure, not the total.
    const mid = buildStaticBudget(memoChainSource, 'Calc.tsx', 'Calc', { fanOutThreshold: 3 })
    const c = mid.fanOut.find(f => f.signal === 'count')!
    expect(c.subscribers).toBeGreaterThanOrEqual(3)
    expect(c.hot).toBe(false)
  })

  test('formats the direct/via-memo split only when a memo barrier routes', () => {
    // Memo chain → the split is shown.
    const withMemo = formatStaticBudget(buildStaticBudget(memoChainSource, 'Calc.tsx', 'Calc'))
    expect(withMemo).toMatch(/count\s+→ \d+ subscribers \(1 direct · \d+ via memo\)/)
    // Counter reads its signal directly (no memo) → no parenthetical.
    const direct = formatStaticBudget(buildStaticBudget(counterSource, 'Counter.tsx', 'Counter'))
    expect(direct).not.toContain('via memo')
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

  test('exposes the handlers --scenario auto would fire, name + loc (#1841 A1)', () => {
    // Two handlers on distinct elements/events. The static list is the coverage
    // gap an agent can read before any run.
    const src = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Form() {
        const [q, setQ] = createSignal('')
        return (
          <div>
            <input onInput={(e) => setQ(e.currentTarget.value)} />
            <button onClick={() => setQ('')}>Clear</button>
          </div>
        )
      }
    `
    const b = buildStaticBudget(src, 'Form.tsx', 'Form')
    expect(b.handlers.length).toBe(2)
    // `name` is `<event>@<slotId>` — the slotId joins to dynamic coverage.
    expect(b.handlers.every(h => /^\w+@\w+$/.test(h.name))).toBe(true)
    const events = b.handlers.map(h => h.name.split('@')[0]).sort()
    expect(events).toEqual(['click', 'input'])
    // Each handler carries a source location.
    for (const h of b.handlers) {
      expect(h.loc.file).toContain('Form.tsx')
      expect(h.loc.line).toBeGreaterThan(0)
    }
  })

  test('handlers is empty when the component binds none', () => {
    const src = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Display() {
        const [n] = createSignal(0)
        return <div>{n()}</div>
      }
    `
    const b = buildStaticBudget(src, 'Display.tsx', 'Display')
    expect(b.handlers).toEqual([])
  })

  test('renders a handlers section in text output when present, omits it otherwise', () => {
    const withHandler = formatStaticBudget(buildStaticBudget(counterSource, 'Counter.tsx', 'Counter'))
    expect(withHandler).toMatch(/handlers \(1\):/)
    expect(withHandler).toMatch(/click@\w+\s+Counter\.tsx:\d+/)

    const noHandler = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Display() {
        const [n] = createSignal(0)
        return <div>{n()}</div>
      }
    `
    expect(formatStaticBudget(buildStaticBudget(noHandler, 'Display.tsx', 'Display'))).not.toContain('handlers (')
  })
})

describe('schemaVersion (#1841)', () => {
  test('every JSON mode carries the schema version', () => {
    const budget = buildStaticBudget(counterSource, 'Counter.tsx', 'Counter')
    expect(budget.schemaVersion).toBe(PROFILE_SCHEMA_VERSION)
    const diff = diffStaticBudget(budget, buildStaticBudget(memoChainSource, 'Calc.tsx', 'Calc'))
    expect(diff.schemaVersion).toBe(PROFILE_SCHEMA_VERSION)
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

  test('a memo barrier that lowers direct fan-out is not a fan-out regression', () => {
    // Before: `count` is read directly by an effect AND a text binding (direct 2).
    const before = `
      'use client'
      import { createSignal, createEffect } from '@barefootjs/client'
      export function R() {
        const [count, setCount] = createSignal(0)
        createEffect(() => console.log(count()))
        return <button>{count()}</button>
      }
    `
    // After: both reads go through a memo, so `count`'s direct fan-out drops to 1
    // (the memo) even though a memo was added and the transitive total rose.
    const after = `
      'use client'
      import { createSignal, createMemo, createEffect } from '@barefootjs/client'
      export function R() {
        const [count, setCount] = createSignal(0)
        const m = createMemo(() => count())
        createEffect(() => console.log(m()))
        return <button>{m()}</button>
      }
    `
    const base = buildStaticBudget(before, 'R.tsx', 'R')
    const head = buildStaticBudget(after, 'R.tsx', 'R')
    expect(base.fanOut.find(f => f.signal === 'count')!.direct).toBe(2)
    expect(head.fanOut.find(f => f.signal === 'count')!.direct).toBe(1)
    // The fan-out delta reads the refactor as the improvement it is: direct
    // fan-out shrank, so the recorded change is a decrease, not growth.
    const diff = diffStaticBudget(base, head)
    const ch = diff.fanOut.find(f => f.signal === 'count')!
    expect(ch.after).toBeLessThan(ch.before)
  })

  test('carries a "diff" kind discriminator (#1849 B2)', () => {
    // The three JSON modes must be distinguishable: a zero-delta diff
    // (signals: 0 = "no change") must not look like a static budget
    // (signals: 0 = "no signals"). `kind` is the discriminator.
    const a = buildStaticBudget(memoChainSource, 'Calc.tsx', 'Calc')
    const diff = diffStaticBudget(a, a)
    expect(diff.kind).toBe('diff')
    expect(diff.signals).toBe(0)
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
    expect(r.schemaVersion).toBe(PROFILE_SCHEMA_VERSION)
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

  test('coverage.diagnostics is a compact summary, not a full id array (#1849 B7)', () => {
    n = 0
    // A long tail of anonymous runtime bookkeeping ids (loop-generated binding
    // ids on a grid component). JSON consumers get a count + a small sample
    // instead of hundreds of `{id,count}` objects.
    const events: ProfilerEvent[] = []
    for (let i = 0; i < 50; i++) {
      events.push(ev('signalSet', { signal: `s${i}` }))
    }
    const r = buildProfileReport({ source: src, filePath: 'Calc.tsx', scenario: 'auto', events })
    expect(r.coverage.diagnostics.count).toBe(50)
    expect(r.coverage.diagnostics.sample.length).toBeLessThanOrEqual(3)
    expect(Array.isArray(r.coverage.diagnostics.sample)).toBe(true)
    // The text report still summarizes by count.
    expect(formatProfileReport(r)).toContain('50 anonymous runtime id(s)')
  })

  test('omitting topN keeps the full subscriber list (the JSON path, #1849 B1)', () => {
    n = 0
    // Five distinct subscribers — more than a small `--top`. The CLI passes
    // `topN: undefined` in JSON mode so the serialized list is never truncated;
    // pinning the contract here guards that the data layer returns everything
    // when no cap is requested.
    const manySrc = `
      'use client'
      import { createSignal, createMemo } from '@barefootjs/client'
      export function Many() {
        const [count, setCount] = createSignal(0)
        const a = createMemo(() => count() + 1)
        const b = createMemo(() => count() + 2)
        const c = createMemo(() => count() + 3)
        const d = createMemo(() => count() + 4)
        const e = createMemo(() => count() + 5)
        return <button onClick={() => setCount(count() + 1)}>{a()}{b()}{c()}{d()}{e()}</button>
      }
    `
    const events: ProfilerEvent[] = []
    for (const name of ['a', 'b', 'c', 'd', 'e']) {
      events.push(ev('effectEnter', { subscriber: `Many#memo:${name}` }))
      events.push(ev('effectExit', { subscriber: `Many#memo:${name}`, dur: 1 }))
    }
    const full = buildProfileReport({ source: manySrc, filePath: 'Many.tsx', scenario: 'auto', events })
    expect(full.hotSubscribers.subscribers).toHaveLength(5)
    // With a cap the table truncates — what JSON mode deliberately avoids.
    const capped = buildProfileReport({ source: manySrc, filePath: 'Many.tsx', scenario: 'auto', events, topN: 2 })
    expect(capped.hotSubscribers.subscribers).toHaveLength(2)
  })
})

describe('findUninstrumentedEffects (#1849 B6)', () => {
  let seq = 0
  const ev = (type: ProfilerEvent['type'], f: Partial<ProfilerEvent> = {}): ProfilerEvent =>
    ({ type, seq: seq++, turn: null, ...f })

  const refEffectSrc = `
    'use client'
    import { createSignal, createEffect } from '@barefootjs/client'
    export function C() {
      const [open, setOpen] = createSignal(false)
      createEffect(() => console.log(open()))          // line 6 — top-level (instrumented)
      const handleMount = (el) => {
        createEffect(() => { el.dataset.state = open() ? 'open' : 'closed' })  // line 8 — nested
      }
      return <button ref={handleMount} onClick={() => setOpen(v => !v)}>{open()}</button>
    }
  `

  test('returns createEffect sites the compiler did not instrument', () => {
    // The top-level effect is on line 6 (instrumented); the ref-callback effect
    // on line 8 is not. Subtracting the instrumented line yields the nested one.
    const all = findUninstrumentedEffects(refEffectSrc, 'C.tsx', new Set())
    expect(all.map(c => c.line)).toEqual([6, 8])
    const candidates = findUninstrumentedEffects(refEffectSrc, 'C.tsx', new Set([6]))
    expect(candidates).toEqual([{ file: 'C.tsx', line: 8 }])
  })

  test('buildProfileReport attaches candidates to an uninstrumented e<n> id', () => {
    seq = 0
    // Drive the nested effect under a runtime fallback id `e1` (no __bfId).
    const events: ProfilerEvent[] = [
      ev('effectEnter', { subscriber: 'e1' }),
      ev('effectExit', { subscriber: 'e1', dur: 3 }),
    ]
    const r = buildProfileReport({ source: refEffectSrc, filePath: 'C.tsx', scenario: 'auto', events })
    const e1 = r.hotSubscribers.subscribers.find(s => s.subscriber === 'e1')!
    expect(e1.resolution).toBe('uninstrumented')
    // Only the uninstrumented (line 8) call is a candidate; the instrumented
    // top-level effect (line 6) is excluded.
    expect(e1.candidates).toEqual([{ file: 'C.tsx', line: 8 }])
  })
})

describe('agent contract: status, findings, guidance (#1841)', () => {
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

  // A memo that re-runs 3× in a single turn → runsPerTurn 3 → flagged `hot`.
  function hotRunEvents(): ProfilerEvent[] {
    n = 0
    const turn = 'Calc#handler:s0:click'
    const events: ProfilerEvent[] = [ev('turnBegin', { handlerId: turn })]
    for (let i = 0; i < 3; i++) {
      events.push(ev('effectEnter', { subscriber: 'Calc#memo:a', turn }))
      events.push(ev('effectExit', { subscriber: 'Calc#memo:a', dur: 1, turn }))
    }
    events.push(ev('turnEnd', {}))
    return events
  }

  test('a clean run is status ok with no findings', () => {
    n = 0
    // One memo run in a turn → runsPerTurn 1 → not hot, nothing flagged.
    const turn = 'Calc#handler:s0:click'
    const events: ProfilerEvent[] = [
      ev('turnBegin', { handlerId: turn }),
      ev('effectEnter', { subscriber: 'Calc#memo:a', turn }),
      ev('effectExit', { subscriber: 'Calc#memo:a', dur: 1, turn }),
      ev('turnEnd', {}),
    ]
    const r = buildProfileReport({ source: src, filePath: 'Calc.tsx', scenario: 'auto', events })
    expect(r.status).toBe('ok')
    expect(r.findings).toHaveLength(0)
    expect(r.coverage.ratio).toBe(1)
    expect(r.guidance).toBeUndefined()
  })

  test('a hot subscriber becomes a warning finding with valid nextCommands', () => {
    const r = buildProfileReport({ source: src, filePath: 'Calc.tsx', scenario: 'auto', events: hotRunEvents() })
    expect(r.status).toBe('warning')
    const hot = r.findings.find(f => f.kind === 'hot-subscriber')!
    expect(hot.severity).toBe('warning')
    expect(hot.actionable).toBe(true)
    expect(hot.subscriber).toBe('Calc#memo:a')
    // A memo id maps to a name `bf debug trace` accepts; graph is the fallback.
    expect(hot.nextCommands).toContain('bf debug trace Calc a --json')
    expect(hot.nextCommands).toContain('bf debug graph Calc --json')
  })

  test('an unresolved id is an actionable coverage-gap finding', () => {
    n = 0
    // A profiler-shaped id with no matching IR node → SR4 coverage gap.
    const events: ProfilerEvent[] = [ev('effectEnter', { subscriber: 'Calc#memo:ghost' })]
    const r = buildProfileReport({ source: src, filePath: 'Calc.tsx', scenario: 'auto', events })
    const gap = r.findings.find(f => f.kind === 'coverage-gap')!
    expect(gap.actionable).toBe(true)
    expect(gap.subscriber).toBe('Calc#memo:ghost')
  })

  test('nextCommands target the component parsed from the id, not the root', () => {
    n = 0
    // A scenario-file run resolves subscribers from composed children: the id's
    // component (`Child`) differs from the profiled root (`Calc`). Follow-up
    // commands must target `Child`, or they point an agent at the wrong file.
    const events: ProfilerEvent[] = [ev('effectEnter', { subscriber: 'Child#memo:ghost' })]
    const r = buildProfileReport({ source: src, filePath: 'Calc.tsx', scenario: 'auto', events })
    const gap = r.findings.find(f => f.kind === 'coverage-gap')!
    expect(gap.nextCommands).toContain('bf debug trace Child ghost --json')
    expect(gap.nextCommands).toContain('bf debug graph Child --json')
    expect(gap.nextCommands.every(c => !c.includes('graph Calc'))).toBe(true)
  })

  test('a zero-turn run emits guidance pointing at a story file', () => {
    n = 0
    // Handlers exist (the onClick) but none fired → no-interactions guidance.
    const events: ProfilerEvent[] = [ev('effectEnter', { subscriber: 'Calc#memo:a' })]
    const r = buildProfileReport({ source: src, filePath: 'Calc.tsx', scenario: 'auto', events })
    expect(r.turns).toBe(0)
    expect(r.guidance?.reason).toBe('no-interactions')
    expect(r.guidance?.nextCommands[0]).toContain('--scenario <story.tsx>')
  })

  describe('evaluateProfileGates', () => {
    test('hot gate fails when a subscriber exceeds the runs/turn budget', () => {
      const r = buildProfileReport({ source: src, filePath: 'Calc.tsx', scenario: 'auto', events: hotRunEvents() })
      const fail = evaluateProfileGates(r, { maxRunsPerTurn: 2 })
      expect(fail.passed).toBe(false)
      expect(fail.failed).toContain('hot')
      const pass = evaluateProfileGates(r, { maxRunsPerTurn: 5 })
      expect(pass.passed).toBe(true)
    })

    test('bare --fail-on hot trips on any flagged hot subscriber', () => {
      const r = buildProfileReport({ source: src, filePath: 'Calc.tsx', scenario: 'auto', events: hotRunEvents() })
      const g = evaluateProfileGates(r, { failOn: ['hot'] })
      expect(g.passed).toBe(false)
      expect(g.checks[0].threshold).toBeNull()
    })

    test('coverage gate compares ratio against --min-coverage', () => {
      n = 0
      // Handlers exist but only mount runs, no turn → ratio 0.
      const events: ProfilerEvent[] = [ev('effectEnter', { subscriber: 'Calc#memo:a' })]
      const r = buildProfileReport({ source: src, filePath: 'Calc.tsx', scenario: 'auto', events })
      expect(r.coverage.ratio).toBe(0)
      const g = evaluateProfileGates(r, { minCoverage: 0.8 })
      expect(g.passed).toBe(false)
      expect(g.failed).toContain('coverage')
    })

    test('unresolved gate counts actionable gaps against --max-unresolved', () => {
      n = 0
      const events: ProfilerEvent[] = [ev('effectEnter', { subscriber: 'Calc#memo:ghost' })]
      const r = buildProfileReport({ source: src, filePath: 'Calc.tsx', scenario: 'auto', events })
      expect(evaluateProfileGates(r, { maxUnresolved: 0 }).passed).toBe(false)
      expect(evaluateProfileGates(r, { maxUnresolved: 5 }).passed).toBe(true)
    })

    test('no configured gate yields an empty, passing result', () => {
      const r = buildProfileReport({ source: src, filePath: 'Calc.tsx', scenario: 'auto', events: hotRunEvents() })
      const g = evaluateProfileGates(r, {})
      expect(g.passed).toBe(true)
      expect(g.checks).toHaveLength(0)
    })
  })
})
