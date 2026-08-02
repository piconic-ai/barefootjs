/**
 * Signal-conditioned early return lowers to the root-ternary plan (#2463).
 *
 * `if (loading()) return <A/>; return <B/>` is semantically the root
 * ternary `return loading() ? <A/> : <B/>`, and the IRIfStatement
 * contract (spec/compiler.md) says the client JS handles all branches
 * and switches at runtime. Before this fix the statement form emitted
 * NO branch-switch effect — clicking called the setter and nothing
 * subscribed, so the UI could never leave the SSR branch — and the CSR
 * template lambda referenced the init-scoped signal (`ReferenceError`
 * on CSR mount; the adapter-tests scope gate pinned it).
 *
 * The fix: a conditional-return chain whose conditions are ALL reactive
 * (signal/memo reads) and that declares no branch-local scope variables
 * is built as the same IRConditional chain the root ternary produces,
 * wrapped in the synthetic display:contents scope element. Chains with
 * static/prop conditions or branch-local declarations keep the
 * IRIfStatement path (#1401/#1414 semantics) unchanged.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../index'
import { HonoAdapter } from '../../../adapter-hono/src/adapter'

function clientJsOf(source: string): string {
  const result = compileJSX(source, 'early-return.tsx', { adapter: new HonoAdapter() })
  expect(result.errors.filter(e => e.severity === 'error')).toEqual([])
  return result.files.filter(f => f.type === 'clientJs').map(f => f.content).join('\n')
}

const EARLY = `
"use client"
import { createSignal } from '@barefootjs/client'

export function LoadGate() {
  const [loading, setLoading] = createSignal(true)
  if (loading()) {
    return <button onClick={() => setLoading(false)}>Loading...</button>
  }
  return <p>Ready</p>
}
`

const TERNARY = `
"use client"
import { createSignal } from '@barefootjs/client'

export function LoadGate() {
  const [loading, setLoading] = createSignal(true)
  return loading() ? <button onClick={() => setLoading(false)}>Loading...</button> : <p>Ready</p>
}
`

describe('signal-conditioned early return (#2463)', () => {
  test('emits the branch-switch insert() plan', () => {
    const clientJs = clientJsOf(EARLY)
    // The statement form must subscribe to the signal and swap branches
    // at runtime, exactly like the expression form.
    expect(clientJs).toContain('insert(')
    expect(clientJs).toContain('() => loading()')
  })

  test('CSR template lambda is scope-sound (signal substituted to its initial)', () => {
    const clientJs = clientJsOf(EARLY)
    const template = clientJs.match(/hydrate\('LoadGate'.*/)?.[0] ?? ''
    // The module-scope lambda must not reference the init-scoped signal.
    expect(template).not.toContain('loading()')
    expect(template).toContain('(true) ?')
  })

  test('statement form and expression form lower to the same plan shape', () => {
    const early = clientJsOf(EARLY)
    const ternary = clientJsOf(TERNARY)
    // Same runtime imports (insert present in both) and both templates
    // wrapped in the synthetic scope element.
    for (const js of [early, ternary]) {
      expect(js).toContain('insert(')
      expect(js).toContain('display:contents')
    }
  })

  test('a prop-conditioned chain keeps the IRIfStatement path', () => {
    const clientJs = clientJsOf(`
export function Badge({ active }: { active: boolean }) {
  if (active) {
    return <strong>on</strong>
  }
  return <em>off</em>
}
`)
    // Static condition: no runtime branch switching, no synthetic wrapper —
    // the pre-#2463 emission is unchanged.
    expect(clientJs).not.toContain('insert(')
    expect(clientJs).not.toContain('display:contents')
  })
})
