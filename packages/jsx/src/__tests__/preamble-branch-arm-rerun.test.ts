/**
 * Codegen-shape pins for the loop-row branch-arm preamble gap (#2596/#2447
 * follow-up, found while discussing #2869's aftermath). Companion to the
 * behavioral test in
 * `packages/client/__tests__/runtime/preamble-branch-attr-staleness.test.ts`,
 * which is the one that actually proves the fix works end to end — this
 * file pins the exact emitted shape so a future refactor of
 * `stringifyLoopChildArm`/`stringifyBranchReactiveAttrs`/
 * `stringifyLoopChildConditional` can't silently drop the preamble re-run
 * again.
 *
 * Two sites were fixed together: a reactive ATTRIBUTE inside a loop row's
 * branch conditional that reads a `.map()` preamble local (case a), and a
 * NESTED conditional's own CONDITION expression doing the same (case b,
 * #2596 one nesting level deeper than the already-fixed outer-conditional
 * case pinned by `preamble-conditional-reactivity.test.ts`). Case c is the
 * negative control: no preamble local in play, so nothing should be
 * injected.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

function clientJsFor(source: string, filename: string): string {
  const result = compileJSX(source, filename, { adapter })
  expect(result.errors).toHaveLength(0)
  const clientJs = result.files.find(f => f.type === 'clientJs')?.content
  if (!clientJs) throw new Error('No client JS emitted')
  return clientJs
}

describe('#2596/#2447 follow-up — preamble re-run inside a loop-row branch arm', () => {
  test('(a) an attribute inside a branch arm re-runs the preamble before reading it', () => {
    const source = `'use client'
import { createSignal } from '@barefootjs/client'
type Row = { id: number; tier: string }
export function List() {
  const [visible] = createSignal(true)
  const [rows] = createSignal<Row[]>([{ id: 1, tier: 'gold' }])
  return (
    <ul>
      {rows().map(row => {
        const cls = 'tier-' + row.tier
        return (
          <li key={row.id}>
            {visible() ? <span class={cls} id="target">{row.tier}</span> : <span>x</span>}
          </li>
        )
      })}
    </ul>
  )
}
`
    const js = clientJsFor(source, 'List.tsx')

    // Pin the eager per-row mapArray path (not lazy-row, not relevant here
    // but keeps this fixture stable if eligibility ever widens).
    expect(js).toContain('mapArray(')

    // The outer conditional's own getter is NOT preamble-guarded (`visible`
    // is a plain signal, no preamble read) — stays bare.
    expect(js).toContain("insert(__el, 's0', () => visible(), {")

    // The arm's attr effect re-runs the preamble before reading `cls`.
    const disposerStart = js.indexOf('const __disposers = []')
    const disposerEnd = js.indexOf('return () => __disposers.forEach')
    const arm = js.slice(disposerStart, disposerEnd)
    const preambleAt = arm.indexOf("const cls = 'tier-' + row().tier;")
    const readAt = arm.indexOf('const __x = cls')
    expect(preambleAt).toBeGreaterThanOrEqual(0)
    expect(readAt).toBeGreaterThan(preambleAt)
  })

  test('(b) a nested conditional inside a branch arm re-runs the preamble in its own condition getter', () => {
    const source = `'use client'
import { createSignal } from '@barefootjs/client'
type Row = { id: number; tier: string }
export function List() {
  const [visible] = createSignal(true)
  const [selected] = createSignal(1)
  const [rows] = createSignal<Row[]>([{ id: 1, tier: 'gold' }])
  return (
    <ul>
      {rows().map(row => {
        const cls = 'tier-' + row.tier
        const on = selected() === row.id
        return (
          <li key={row.id}>
            {visible() ? <div><span>{cls}</span>{on ? <em id="yes">yes</em> : <em id="no">no</em>}</div> : <span>x</span>}
          </li>
        )
      })}
    </ul>
  )
}
`
    const js = clientJsFor(source, 'List2.tsx')

    expect(js).toMatch(
      /insert\(__branchScope, 's\d+', \(\) => \{ const cls = 'tier-' \+ row\(\)\.tier; const on = selected\(\) === row\(\)\.id;; return \(on\) \}, \{/,
    )
  })

  test('(c) negative control — no preamble local in play, nothing injected', () => {
    const source = `'use client'
import { createSignal } from '@barefootjs/client'
type Row = { id: number; tier: string }
export function List() {
  const [visible] = createSignal(true)
  const [rows] = createSignal<Row[]>([{ id: 1, tier: 'gold' }])
  return (
    <ul>
      {rows().map(row => (
        <li key={row.id}>
          {visible() ? <span class={row.tier} id="target">{row.tier}</span> : <span>x</span>}
        </li>
      ))}
    </ul>
  )
}
`
    const js = clientJsFor(source, 'List3.tsx')

    expect(js).not.toContain('const cls =')
    // The attr effect still exists and still writes — just with no
    // preamble re-run ahead of it, since there is nothing to re-run.
    const disposerStart = js.indexOf('const __disposers = []')
    const disposerEnd = js.indexOf('return () => __disposers.forEach')
    const arm = js.slice(disposerStart, disposerEnd)
    expect(arm).toContain("setAttribute('class'")
  })
})
