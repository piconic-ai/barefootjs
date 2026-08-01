import { createFixture } from '../src/types'

/**
 * Signal-conditioned early return:
 * `if (loading()) return <button/>; return <p/>`.
 *
 * The SSR side renders the initial branch correctly — that is what
 * `expectedHtml` pins. The gap is the client side (#2463): no
 * branch-switch effect is emitted (clicking calls `setLoading(false)`
 * and nothing subscribes, so the UI can never leave the SSR branch),
 * and the CSR template lambda references `loading()` out of scope — a
 * `ReferenceError` on CSR mount, pinned by this fixture's skip entry
 * in `csr-conformance.test.ts` (pointer:
 * https://github.com/piconic-ai/barefootjs/issues/2463).
 *
 * The semantically identical root ternary
 * (`return loading() ? <button/> : <p/>`) compiles correctly to an
 * `insert()` with a branch-switch effect — see the `top-level-ternary`
 * fixture — so this pins the statement-form/expression-form asymmetry.
 * Not covered by the closed prop-conditioned early-return issues
 * (#1401 etc.); a fixture-hydrate `interactions` step (click → expect
 * `Ready`) should land together with the #2463 fix.
 */
export const fixture = createFixture({
  id: 'signal-early-return',
  description: 'Signal-conditioned early return renders the initial branch (#2463 pins the client side)',
  source: `
"use client"
import { createSignal } from '@barefootjs/client'

export function LoadGate() {
  const [loading, setLoading] = createSignal(true)
  if (loading()) {
    return <button onClick={() => setLoading(false)}>Loading...</button>
  }
  return <p>Ready</p>
}
`,
  expectedHtml: `
    <button bf-s="test" bf="s0">Loading...</button>
  `,
})
