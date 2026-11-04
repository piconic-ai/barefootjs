import { createFixture } from '../src/types'

/**
 * A value-position fallback that reads a source binding named like the
 * parameter an adapter generates for its lazy right operand (#3839). Twig
 * spells `l ?? r` (for a non-variable `l`) and `l || r` / `l && r` as a
 * filter taking `r` in an arrow function, `(__bf_lazy) => r`, and Twig binds
 * an arrow's parameter over the context inside its body. A prop named
 * `__bf_lazy` read in `r` must still be the prop, so the generated parameter
 * may not take a name that `r` reads.
 *
 * The prop is the fallback of a composed `??`, of `||` and of `&&`, in a text
 * child and an attribute, and is read once more after them on its own.
 */
export const fixture = createFixture({
  id: 'lazy-fallback-name-collision',
  description: 'A prop named like the generated lazy-operand parameter stays the prop inside a `??` / `||` / `&&` fallback',
  source: `
'use client'

export function LazyFallbackNameCollision({ a, b, zero, label, __bf_lazy }: {
  a?: string | null
  b?: string | null
  zero: number
  label: string
  __bf_lazy: string
}) {
  return (
    <div
      data-nullish={(a ?? b) ?? __bf_lazy}
      data-or={zero || __bf_lazy}
      data-and={label && __bf_lazy}
    >
      <span>[{(a ?? b) ?? __bf_lazy}][{zero || __bf_lazy}][{label && __bf_lazy}]</span>
      <span>[{(zero || a) ?? __bf_lazy}][{__bf_lazy}]</span>
    </div>
  )
}
`,
  props: {
    a: null,
    b: null,
    zero: 0,
    label: 'x',
    __bf_lazy: 'fallback',
  },
  expectedHtml: `
    <div bf-s="test" bf="s8" data-and="fallback" data-nullish="fallback" data-or="fallback">
      <span bf="s4">[<!--bf:s0-->fallback<!--/-->][<!--bf:s1-->fallback<!--/-->][<!--bf-cond-start:s2--><!--bf:s3-->fallback<!--/--><!--bf-cond-end:s2-->]</span>
      <span bf="s7">[<!--bf:s5-->fallback<!--/-->][<!--bf:s6-->fallback<!--/-->]</span>
    </div>
  `,
})
