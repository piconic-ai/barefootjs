import { createFixture } from '../src/types'

/**
 * Signal-conditioned early return:
 * `if (loading()) return <button/>; return <p/>`.
 *
 * FIXED (#2463): the statement form now lowers to the exact plan the
 * semantically identical root ternary gets — the synthetic
 * display:contents scope wrapper plus an `insert()` whose branches carry
 * their own templates and event bindings, so the client switches
 * branches at runtime and the CSR template lambda substitutes the
 * signal's initial value instead of referencing it out of scope. This
 * fixture is the regression armor for that lowering; the runtime
 * branch-swap behavior itself is shared with (and covered by) the
 * `top-level-ternary` machinery.
 *
 * The statement path is taken only for chains whose conditions all call
 * signal/memo getters and that declare no branch-local scope variables —
 * prop-conditioned chains (`conditional-return-button` etc.) stay on the
 * #1401-family IRIfStatement emission.
 */
export const fixture = createFixture({
  id: 'signal-early-return',
  description: 'Signal-conditioned early return lowers to the root-ternary branch-switch plan (#2463)',
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
    <div bf-s="test" style="display:contents"><button bf-c="s1" bf="s0">Loading...</button></div>
  `,
})
