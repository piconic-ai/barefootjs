import { createFixture } from '../src/types'

/**
 * A `.map()` callback param shadowing an outer destructured prop, where the
 * loop's array source is ITSELF a destructured prop (#2222; the const-shadow
 * half of the same bug class is #2221). Before the fix this combined shape
 * was untestable in this harness at all: the plain-`.map()` fallback skipped
 * `setArray`, so the hydrate `template:` lambda referenced the bare
 * destructured `values` and threw `ReferenceError: values is not defined`
 * before hydration ever reached the shadowing bug — see #2212's "Discovery
 * context" for why this fixture couldn't be added until both landed. Now
 * that all three fixes are in place, this fixture pins:
 *
 *   - bug 1: `values.map(...)` (the plain fallback, not a chained
 *     `filter().map()`) lowers to `_p.values.map(...)` in the CSR
 *     template, not a bare `values.map(...)`.
 *   - bug 2 (prop-shadow half of #2235): the callback param `label`
 *     shadows the outer destructured `label` prop. Outside the loop,
 *     `<p>{label + suffix}</p>` keeps BOTH the `_p.label` prop rewrite AND
 *     the `suffix` const inline. Inside the loop, `key={label}` and
 *     `{1 + label}` use the loop's own bound value at each index — never
 *     `_p.label`, and never baked to a stale outer value.
 *
 * Props are non-empty (`label`, `values`) so SSR renders real prop-driven
 * text/markup and the CSR template evaluates the loop body against real
 * data, not just `[]`.
 */
export const fixture = createFixture({
  id: 'loop-param-shadows-outer-name',
  description: '.map() callback param shadows an outer destructured prop, with the array itself sourced from a destructured prop (#2212, #2221, #2222)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function LoopParamShadowsOuterName({ label, values }: { label: string; values: number[] }) {
  const suffix = '!'
  const [n, setN] = createSignal(0)
  return (
    <div data-n={n()} onClick={() => setN(n() + 1)}>
      <p>{label + suffix}</p>
      <ul>
        {values.map((label) => (
          <li key={label}>{1 + label}</li>
        ))}
      </ul>
    </div>
  )
}
`,
  props: { label: 'Item', values: [1, 2, 3] },
  expectedHtml: `
    <div bf-s="test" bf="s5" data-n="0">
      <p bf="s1"><!--bf:s0-->Item!<!--/--></p>
      <ul bf="s4">
        <li bf="s3" data-key="1"><!--bf:s2-->2<!--/--></li>
        <li bf="s3" data-key="2"><!--bf:s2-->3<!--/--></li>
        <li bf="s3" data-key="3"><!--bf:s2-->4<!--/--></li>
      </ul>
    </div>
  `,
})
