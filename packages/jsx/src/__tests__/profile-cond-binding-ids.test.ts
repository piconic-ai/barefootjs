/**
 * Profile-mode ids on conditional-branch DOM-binding effects (#1690, SR3/SR4,
 * issue #1795 Phase 1).
 *
 * A conditional's `insert()` effect, and the attribute / text binding effects
 * emitted inside its branch `bindEvents`, carry a `<Component>#binding:<slotId>`
 * id in profile mode so the profiler attributes their re-runs to source.
 * `buildIdIndex` resolves those ids from the graph's `domBindings`
 * (conditional / attribute / text slot + loc). Off by default the emitted
 * effects are byte-identical (SR8).
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'
import { buildIdIndex } from '../profiler'
import { buildComponentAnalysis } from '../debug'

const adapter = new TestAdapter()

// `open() &&` produces a conditional (s1); inside its branch the `class={...}`
// is a reactive attribute (s3) and `{n()}` is a reactive text effect (s2).
const source = `
  'use client'
  import { createSignal } from '@barefootjs/client'
  export function Disclosure() {
    const [open, setOpen] = createSignal(false)
    const [n] = createSignal(0)
    return (
      <div>
        <button onClick={() => setOpen(!open())}>toggle</button>
        {open() && <p class={open() ? 'a' : 'b'}>count: {n()}</p>}
      </div>
    )
  }
`

function clientJs(profile: boolean): string {
  return compileJSX(source, 'Disclosure.tsx', { adapter, profile })
    .files.find(f => f.type === 'clientJs')!.content
}

describe('conditional binding-effect ids (#1795 Phase 1)', () => {
  test('profile off: no #binding ids anywhere (SR8)', () => {
    expect(clientJs(false)).not.toContain('#binding:')
  })

  test('profile on: the conditional insert() effect carries a #binding id', () => {
    const on = clientJs(true)
    // The id is the last argument to the `insert(...)` call, which closes on
    // its own line as `}, "<id>")` (single paren — distinct from the branch
    // effects' `}, "<id>"))`). Anchor the line so this can't match a nested
    // effect's close instead.
    expect(on).toMatch(/^\s*}, "Disclosure#binding:s\d+"\)$/m)
    // And it really is an insert() call that opened the block.
    expect(on).toContain("insert(__scope, 's1'")
  })

  test('profile on: branch attribute and text effects carry #binding ids', () => {
    const on = clientJs(true)
    // Branch reactive attribute effect (createDisposableEffect with the class write).
    expect(on).toMatch(/setAttribute\('class'[\s\S]*?}, "Disclosure#binding:s\d+"\)\)/)
    // Branch reactive text effect (__bfText path).
    expect(on).toMatch(/__bfText\([\s\S]*?}, "Disclosure#binding:s\d+"\)\)/)
  })

  test('buildIdIndex resolves conditional / attribute / text binding ids to source loc', () => {
    const { graph } = buildComponentAnalysis(source, 'Disclosure.tsx')
    const index = buildIdIndex(graph)

    for (const type of ['conditional', 'attribute', 'text'] as const) {
      const binding = graph.domBindings.find(b => b.type === type)
      expect(binding, `expected a ${type} domBinding`).toBeTruthy()
      const node = index.get(`Disclosure#binding:${binding!.slotId}`)
      expect(node?.kind, `${type} binding should resolve to an effect`).toBe('effect')
      expect(node?.loc.file).toBe('Disclosure.tsx')
      expect(node?.loc.line).toBeGreaterThan(0)
    }
  })
})
