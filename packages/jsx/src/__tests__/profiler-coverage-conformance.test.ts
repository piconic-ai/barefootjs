/**
 * Profiler coverage conformance (#1690, SR4).
 *
 * This is the drift guard for the profiler's id instrumentation. The compiler
 * attributes reactive re-runs to source by emitting `<Component>#binding:<slot>`
 * / `#handler:<slot>:<event>` / `#signal:<name>` / `#memo:<name>` /
 * `#effect:<line>` ids, and `buildIdIndex` resolves them back to a source line.
 * Because a binding/loop id is an *optional* trailing argument (required for
 * SR8 — byte-identical output when profiling is off), forgetting to thread it
 * into a NEW emit path is not a type error; the effect would silently re-run as
 * a bare runtime id and never show attributed in `bf debug profile`.
 *
 * `computeGaps()` computes the bidirectional invariant for one component:
 *
 *   (a) coverage   — every reactive entity the analyzer reports (DOM bindings,
 *       event handlers, signals, memos) is emitted with a matching id. A new
 *       emit path that forgets its id surfaces here as `missing`.
 *   (b) resolution — every `<Comp>#…` id emitted in the client JS resolves via
 *       `buildIdIndex`. A dropped/renamed analyzer entity, or an id built from a
 *       non-slot (`#binding:?`), surfaces here as `unresolved`.
 *
 * The MATRIX exercises every reactive emit path. If you add a new emit shape,
 * add a representative component to it and thread `profileComponentName` until
 * `computeGaps()` is empty — that is the contract. The `guard self-test` block
 * proves `computeGaps()` actually detects a dropped id and a bogus id, so the
 * detector itself cannot rot silently.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'
import { buildIdIndex } from '../profiler'
import { buildComponentAnalysis } from '../debug'

const adapter = new TestAdapter()

// Compilation/analysis are pure for a given (source, name) — memoize so the
// 13-component matrix (each touched by several assertions) compiles each shape
// at most twice (on/off) instead of dozens of times. Keeps the suite snappy.
const jsCache = new Map<string, string>()
function clientJs(source: string, name: string, profile: boolean): string {
  const key = `${name}:${profile}`
  let js = jsCache.get(key)
  if (js === undefined) {
    js = compileJSX(source, `${name}.tsx`, { adapter, profile })
      .files.find(f => f.type === 'clientJs')!.content
    jsCache.set(key, js)
  }
  return js
}

const graphCache = new Map<string, ReturnType<typeof buildComponentAnalysis>['graph']>()
function analyze(source: string, name: string): ReturnType<typeof buildComponentAnalysis>['graph'] {
  let g = graphCache.get(name)
  if (g === undefined) {
    g = buildComponentAnalysis(source, `${name}.tsx`).graph
    graphCache.set(name, g)
  }
  return g
}

/** All `<Comp>#…` profiler ids present in a profile-mode build. */
function emittedIds(name: string, on: string): string[] {
  const re = new RegExp(`"(${name}#(?:signal|memo|effect|binding|handler):[^"]+)"`, 'g')
  return [...new Set([...on.matchAll(re)].map(m => m[1]))]
}

interface Gaps {
  /** Analyzer entities with no emitted id (a forgotten emit-side thread). */
  missing: string[]
  /** Emitted ids that `buildIdIndex` cannot resolve (a dangling id). */
  unresolved: string[]
}

/**
 * The bidirectional coverage check, as a pure function over a component's
 * profile-mode client JS and its analysis graph. Shared by the matrix tests and
 * the guard self-test (which feeds it deliberately-broken input).
 */
function computeGaps(name: string, on: string, graph: ReturnType<typeof buildComponentAnalysis>['graph']): Gaps {
  const index = buildIdIndex(graph)
  const missing: string[] = []
  for (const b of graph.domBindings) {
    if (b.slotId === '?') continue // slot-less → not emittable, analyzer emits none either
    if (b.type === 'event') {
      if (!on.includes(`${name}#handler:${b.slotId}:`)) missing.push(`handler ${b.slotId}`)
    } else if (!on.includes(`"${name}#binding:${b.slotId}"`)) {
      missing.push(`${b.type} ${b.slotId}`)
    }
  }
  for (const s of graph.signals) {
    if (!on.includes(`"${name}#signal:${s.name}"`)) missing.push(`signal ${s.name}`)
  }
  for (const m of graph.memos) {
    if (!on.includes(`"${name}#memo:${m.name}"`)) missing.push(`memo ${m.name}`)
  }
  const unresolved = emittedIds(name, on).filter(id => !index.has(id))
  return { missing, unresolved }
}

function gapsFor(name: string, source: string): Gaps {
  return computeGaps(name, clientJs(source, name, true), analyze(source, name))
}

/** One representative component per distinct reactive emit path. */
const MATRIX: ReadonlyArray<{ name: string; desc: string; source: string }> = [
  {
    name: 'TopLevel',
    desc: 'top-level text + attribute + handler',
    source: `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function TopLevel() {
        const [n, setN] = createSignal(0)
        return <button onClick={() => setN(n() + 1)} class={n() > 0 ? 'on' : 'off'}>{n()}</button>
      }`,
  },
  {
    name: 'PropAttr',
    desc: 'prop-driven attribute bindings (with and without a co-located handler)',
    source: `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function PropAttr(props: { id?: string; disabled?: boolean; className?: string }) {
        const [n, setN] = createSignal(0)
        return (
          <div id={props.id} class={\`base \${props.className ?? ''}\`}>
            <button onClick={() => setN(n() + 1)} class={\`btn \${props.className ?? ''}\`}>{n()}</button>
          </div>
        )
      }`,
  },
  {
    name: 'SignalMemoEffect',
    desc: 'signal + memo + user effect + keyboard handler',
    source: `
      'use client'
      import { createSignal, createMemo, createEffect } from '@barefootjs/client'
      export function SignalMemoEffect() {
        const [n, setN] = createSignal(0)
        const dbl = createMemo(() => n() * 2)
        createEffect(() => { console.log(dbl()) })
        return <button onClick={() => setN(n() + 1)} onKeyDown={() => setN(0)}>{dbl()}</button>
      }`,
  },
  {
    name: 'CondBranch',
    desc: 'conditional + branch attribute/text',
    source: `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function CondBranch() {
        const [o, setO] = createSignal(false)
        return (
          <div>
            <button onClick={() => setO(!o())}>t</button>
            {o() && <p class={o() ? 'a' : 'b'}>{o() ? 'yes' : 'no'}</p>}
          </div>
        )
      }`,
  },
  {
    name: 'NestedConditional',
    desc: 'a conditional nested inside another conditional branch',
    source: `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function NestedConditional() {
        const [a, setA] = createSignal(true)
        const [b] = createSignal(true)
        return (
          <div>
            <button onClick={() => setA(!a())}>x</button>
            {a() && <div>{b() ? <span>{a() ? 'y' : 'n'}</span> : <em>e</em>}</div>}
          </div>
        )
      }`,
  },
  {
    name: 'LoopChild',
    desc: 'loop child text + attribute',
    source: `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function LoopChild() {
        const [items] = createSignal([{ id: 1, t: 'a', n: 0 }])
        return <ul>{items().map(it => <li key={it.id} class={it.n > 0 ? 'h' : 'c'}>{it.t}</li>)}</ul>
      }`,
  },
  {
    name: 'LoopMultiAttr',
    desc: 'loop child with two reactive attributes on one element',
    source: `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function LoopMultiAttr() {
        const [items] = createSignal([{ id: 1, n: 0, t: 'a' }])
        return <ul>{items().map(it => <li key={it.id} class={it.n > 0 ? 'h' : 'c'} data-t={it.t}>{it.t}</li>)}</ul>
      }`,
  },
  {
    name: 'Nested',
    desc: 'loop → conditional+branch-text → inner loop → text',
    source: `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Nested() {
        const [rows] = createSignal([{ id: 1, on: true, label: 'a', tags: ['x'] }])
        return (
          <ul>
            {rows().map(r => (
              <li key={r.id}>
                {r.on ? <span>{r.label}</span> : <em>off</em>}
                <ul>{r.tags.map(t => <li key={t}>{t}</li>)}</ul>
              </li>
            ))}
          </ul>
        )
      }`,
  },
  {
    name: 'InnerLoopAttr',
    desc: 'inner (nested) loop child with a reactive attribute',
    source: `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function InnerLoopAttr() {
        const [rows] = createSignal([{ id: 1, tags: [{ k: 'x', on: true }] }])
        return (
          <ul>
            {rows().map(r => (
              <li key={r.id}>
                <ul>{r.tags.map(t => <li key={t.k} class={t.on ? 'a' : 'b'}>{t.k}</li>)}</ul>
              </li>
            ))}
          </ul>
        )
      }`,
  },
  {
    name: 'BranchLoop',
    desc: 'loop inside a conditional branch',
    source: `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function BranchLoop() {
        const [open] = createSignal(true)
        const [items] = createSignal([{ id: 1, t: 'a' }])
        return <div>{open() && <ul>{items().map(it => <li key={it.id}>{it.t}</li>)}</ul>}</div>
      }`,
  },
  {
    name: 'AnchoredLoop',
    desc: 'whole-item conditional loop (mapArrayAnchored)',
    source: `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function AnchoredLoop() {
        const [items] = createSignal([{ id: 1, on: true, t: 'a' }])
        return <ul>{items().map(it => (it.on ? <li key={it.id}>{it.t}</li> : null))}</ul>
      }`,
  },
  {
    name: 'StaticLoop',
    desc: 'static-array loop with signal-driven child text',
    source: `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function StaticLoop() {
        const [n] = createSignal(0)
        const tabs = [{ id: 1 }, { id: 2 }]
        return <ul>{tabs.map(tab => <li key={tab.id}>{n()}</li>)}</ul>
      }`,
  },
  {
    name: 'ComponentLoop',
    desc: 'loop whose body is a child component',
    source: `
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { Row } from './Row'
      export function ComponentLoop() {
        const [items] = createSignal([{ id: 1, label: 'a' }])
        return <div>{items().map(it => <Row key={it.id} label={it.label} />)}</div>
      }`,
  },
  {
    name: 'CompositeLoop',
    desc: 'loop body mixing a DOM binding and a child component',
    source: `
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { Row } from './Row'
      export function CompositeLoop() {
        const [items] = createSignal([{ id: 1, t: 'a' }])
        return <ul>{items().map(it => <li key={it.id}><span>{it.t}</span><Row label={it.t} /></li>)}</ul>
      }`,
  },
]

describe('profiler coverage conformance (#1690 SR4)', () => {
  for (const { name, desc, source } of MATRIX) {
    describe(`${name} — ${desc}`, () => {
      test('(a)+(b) every reactive entity is emitted and every emitted id resolves', () => {
        const { missing, unresolved } = gapsFor(name, source)
        expect(missing, `un-instrumented entities in ${name}`).toEqual([])
        expect(unresolved, `unresolved emitted ids in ${name}`).toEqual([])
      })

      test('profile mode actually emitted ids (sanity)', () => {
        const on = clientJs(source, name, true)
        expect(emittedIds(name, on).length, `${name} emitted no profiler ids`).toBeGreaterThan(0)
      })

      test('profile off: no profiler ids (SR8)', () => {
        const off = clientJs(source, name, false)
        expect(off).not.toContain('#binding:')
        expect(off).not.toContain('#handler:')
        expect(off).not.toContain('#signal:')
        expect(off).not.toContain('#memo:')
      })
    })
  }

  // The detector must itself be proven to fail on broken input — otherwise a
  // bug in `computeGaps` would make the whole matrix a no-op that passes on
  // anything. We feed it a real build with one tampering and assert the gap is
  // reported, for each of the two failure modes.
  describe('guard self-test — computeGaps detects tampering', () => {
    const name = 'Nested'
    const source = MATRIX.find(m => m.name === name)!.source

    test('clean build reports no gaps', () => {
      const { missing, unresolved } = gapsFor(name, source)
      expect(missing).toEqual([])
      expect(unresolved).toEqual([])
    })

    test('a DROPPED binding id is reported as missing (a)', () => {
      const on = clientJs(source, name, true)
      const id = emittedIds(name, on).find(i => i.includes('#binding:'))!
      // Strip every emission of that one id (the trailing `, "<id>"` argument).
      const tampered = on.replaceAll(`, ${JSON.stringify(id)}`, '')
      const { missing, unresolved } = computeGaps(name, tampered, analyze(source, name))
      const slot = id.split('#binding:')[1]
      expect(missing.some(m => m.endsWith(slot))).toBe(true)
      // Dropping an id doesn't create dangling ids.
      expect(unresolved).toEqual([])
    })

    test('a BOGUS (unresolvable) id is reported as unresolved (b)', () => {
      const on = clientJs(source, name, true)
      // Inject an id whose slot has no domBinding (mirrors a future emit path
      // that builds an id from a non-slot, e.g. the `#binding:?` regression).
      const tampered = `${on}\nconst __probe = "Nested#binding:s999"\n`
      const { unresolved } = computeGaps(name, tampered, analyze(source, name))
      expect(unresolved).toContain('Nested#binding:s999')
    })
  })
})
