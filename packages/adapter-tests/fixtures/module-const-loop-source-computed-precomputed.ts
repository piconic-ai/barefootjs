import { createFixture } from '../src/types'

/**
 * `prop-precompute` twin of `module-const-loop-source-computed` (#2946) —
 * the second escape kind the BF101 diagnostic offers alongside
 * `client-directive`.
 *
 * The base refuses on every non-Hono adapter because the loop array is a
 * module-scope const with a computed initializer (`buildItems()`). This
 * twin moves the computation out of the component entirely — the caller
 * passes the already-built array in as a prop, so no adapter is ever asked
 * to evaluate the function call. Unlike the `-client` twin (SSR renders no
 * rows), this one renders the full rows on every adapter, same as
 * `static-array-from-props-precomputed`'s contrast with
 * `static-array-from-props-client`.
 */
export const fixture = createFixture({
  id: 'module-const-loop-source-computed-precomputed',
  description: 'prop-precompute twin of module-const-loop-source-computed — computation moved to the caller, full SSR (#2946)',
  source: `
'use client'

type Props = {
  items: string[]
}

export function ModuleConstLoopSourceComputedPrecomputed(props: Props) {
  return (
    <div className="container">
      {props.items.map(item => (
        <div key={item} data-item={item}>row {item}</div>
      ))}
    </div>
  )
}
`,
  props: {
    items: ['a', 'b', 'c'],
  },
  expectedHtml: `
    <div bf-s="test" bf="s2" class="container">
      <div bf="s1" data-item="a" data-key="a">row <!--bf:s0-->a<!--/--></div>
      <div bf="s1" data-item="b" data-key="b">row <!--bf:s0-->b<!--/--></div>
      <div bf="s1" data-item="c" data-key="c">row <!--bf:s0-->c<!--/--></div>
    </div>
  `,
})
