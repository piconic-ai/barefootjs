/**
 * Profile-mode ids on deeply-nested loop binding effects (#1690, SR3/SR4,
 * issue #1795 Phase 3).
 *
 * Phases 1–2 covered top-level, conditional-branch, and direct loop-child
 * bindings. Phase 3 closes the remaining nested emit paths so every binding
 * effect a loop produces carries a `<Component>#binding:<slotId>` id and every
 * emitted id resolves via `buildIdIndex`:
 *
 *   - loop-child conditional `insert()` + its branch text (`emitArmText`)
 *   - inner / nested loop `mapArray` + inner-loop child text/attr effects
 *   - branch-scoped loop `mapArray` (loop inside a conditional)
 *   - static-array loop child text/attr effects
 *   - component loop `mapArray`
 *
 * Off by default the emitted effects are byte-for-byte unchanged (SR8).
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'
import { buildIdIndex } from '../profiler'
import { buildComponentAnalysis } from '../debug'

const adapter = new TestAdapter()

function clientJs(source: string, name: string, profile: boolean): string {
  return compileJSX(source, `${name}.tsx`, { adapter, profile })
    .files.find(f => f.type === 'clientJs')!.content
}

/** Every emitted `<Comp>#binding:sN` id must resolve via buildIdIndex (no gap). */
function assertNoCoverageGap(source: string, name: string): string[] {
  const on = clientJs(source, name, true)
  const { graph } = buildComponentAnalysis(source, `${name}.tsx`)
  const index = buildIdIndex(graph)
  const emitted = [...new Set([...on.matchAll(new RegExp(`"(${name}#binding:s\\d+)"`, 'g'))].map(m => m[1]))]
  const unresolved = emitted.filter(id => !index.has(id))
  expect(unresolved).toEqual([])
  return emitted
}

// A loop item with BOTH a conditional (with a branch text) AND an inner loop —
// exercises emitOuterConditional, emitArmText, and the inner-loop mapArray.
const nestedSource = `
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
  }
`

const branchLoopSource = `
  'use client'
  import { createSignal } from '@barefootjs/client'
  export function BranchLoop() {
    const [open] = createSignal(true)
    const [items] = createSignal([{ id: 1, t: 'a' }])
    return <div>{open() && <ul>{items().map(it => <li key={it.id}>{it.t}</li>)}</ul>}</div>
  }
`

const staticLoopSource = `
  'use client'
  import { createSignal } from '@barefootjs/client'
  export function StaticLoop() {
    const [n] = createSignal(0)
    const tabs = [{ id: 1 }, { id: 2 }]
    return <ul>{tabs.map(tab => <li key={tab.id}>{n()}</li>)}</ul>
  }
`

const componentLoopSource = `
  'use client'
  import { createSignal } from '@barefootjs/client'
  import { Row } from './Row'
  export function CompLoop() {
    const [items] = createSignal([{ id: 1, label: 'a' }])
    return <div>{items().map(it => <Row key={it.id} label={it.label} />)}</div>
  }
`

describe('nested loop binding ids (#1795 Phase 3)', () => {
  test('profile off: no #binding ids in any nested shape (SR8)', () => {
    for (const [src, name] of [
      [nestedSource, 'Nested'],
      [branchLoopSource, 'BranchLoop'],
      [staticLoopSource, 'StaticLoop'],
      [componentLoopSource, 'CompLoop'],
    ] as const) {
      expect(clientJs(src, name, false)).not.toContain('#binding:')
    }
  })

  test('loop-child conditional + inner loop: every binding resolves', () => {
    const emitted = assertNoCoverageGap(nestedSource, 'Nested')
    // conditional + arm text + inner-loop text + inner loop + outer loop = 5.
    expect(emitted.length).toBe(5)
  })

  test('loop-child conditional insert() and its branch text carry ids', () => {
    const on = clientJs(nestedSource, 'Nested', true)
    // The branch-arm text (`{r.label}` inside the conditional's true arm).
    expect(on).toMatch(/__rt_s\d+\.textContent = String\(r\(\)\.label\) }, "Nested#binding:s\d+"\)/)
    // The inner loop's child text (`{t}`).
    expect(on).toMatch(/String\(t\(\)\) }, "Nested#binding:s\d+"\)/)
  })

  test('branch-scoped loop (loop inside a conditional) attributes its mapArray', () => {
    const emitted = assertNoCoverageGap(branchLoopSource, 'BranchLoop')
    // conditional + branch loop + loop-child text = 3.
    expect(emitted.length).toBe(3)
    const on = clientJs(branchLoopSource, 'BranchLoop', true)
    expect(on).toMatch(/mapArray\([\s\S]*?"BranchLoop#binding:s\d+"\)/)
  })

  test('static-array loop child effects carry ids', () => {
    const emitted = assertNoCoverageGap(staticLoopSource, 'StaticLoop')
    expect(emitted.length).toBeGreaterThanOrEqual(1)
    const on = clientJs(staticLoopSource, 'StaticLoop', true)
    expect(on).toMatch(/textContent = String\(n\(\)\) }, "StaticLoop#binding:s\d+"\)/)
  })

  test('component loop attributes its mapArray', () => {
    const emitted = assertNoCoverageGap(componentLoopSource, 'CompLoop')
    expect(emitted).toContain('CompLoop#binding:s1')
  })
})
