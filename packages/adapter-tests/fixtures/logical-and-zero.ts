import { createFixture } from '../src/types'

/**
 * `{n && <jsx/>}` with `n === 0` — BarefootJS renders NOTHING for any
 * falsy left operand, where React (and Solid) render the number `0`
 * itself. This fixture documents that deliberate ecosystem divergence
 * as an executable contract: SSR and CSR agree with each other (the
 * conditional slot stays empty), they just differ from React.
 *
 * Found in the onboarding TSX-fidelity exploration (PR #2461). If the
 * semantics are ever aligned to React, this fixture is the
 * change-time coupling point: update `expectedHtml` (n=0 renders `0`)
 * in the same PR as the compiler change.
 */
export const fixture = createFixture({
  id: 'logical-and-zero',
  description: 'Falsy-zero `{n && jsx}` renders nothing (documented React divergence)',
  source: `
export function ZeroGate({ n }: { n: number }) {
  return <div>{n && <em>nonzero</em>}</div>
}
`,
  props: { n: 0 },
  expectedHtml: `
    <div bf-s="test" bf="s1"><!--bf-cond-start:s0--><!--bf-cond-end:s0--></div>
  `,
})
