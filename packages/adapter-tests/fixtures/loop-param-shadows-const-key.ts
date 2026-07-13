import { createFixture } from '../src/types'

/**
 * A `.map()` callback param shadowing a LOCAL LITERAL CONST, referenced as
 * the loop's `key` and in the item text (#2235 — the exact issue repro).
 *
 * The key position is special: `tryResolveIdentifierAsTemplateLiteral` →
 * `findLocalConst` folds a bare-identifier attribute value to the const's
 * literal at IR-GENERATION time, before any adapter runs — so pre-fix,
 * EVERY adapter (including Hono's native JSX re-emission) baked
 * `key="x"` / `data-key="x"` into each iteration: duplicate keys and a
 * broken reconciliation identity, with no error. The sibling fixture
 * `loop-param-shadows-outer-name` pins the PROP-shadow half of the bug
 * class; this one pins the const-shadow half at the attribute position
 * (its text-position half is pinned per-adapter by the #2221 unit tests).
 *
 * Deliberately NO outside-the-loop reference to the const: the Twig
 * family's coarse #2221 guard suppresses inlining for a loop-bound name
 * at non-shadowed occurrences too (rendering empty where the scope-precise
 * backends render 'x') — that accepted trade-off is pinned per-adapter by
 * the #2221 unit tests and would otherwise force divergence declarations
 * here for behavior that is working as designed.
 */
export const fixture = createFixture({
  id: 'loop-param-shadows-const-key',
  description: '.map() callback param shadows a local literal const used as key + text (#2235)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function LoopParamShadowsConstKey({ rows }: { rows: number[] }) {
  const label: string = 'x'
  const [n, setN] = createSignal(0)
  return (
    <div data-n={n()} onClick={() => setN(n() + 1)}>
      <ul>
        {rows.map((label) => (
          <li key={label}>{label}</li>
        ))}
      </ul>
    </div>
  )
}
`,
  props: { rows: [10, 20] },
  expectedHtml: `
    <div bf-s="test" bf="s2" data-n="0"><ul bf="s1"><li data-key="10"><!--bf:s0-->10<!--/--></li><li data-key="20"><!--bf:s0-->20<!--/--></li></ul></div>
  `,
})
