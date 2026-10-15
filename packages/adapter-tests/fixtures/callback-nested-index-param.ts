import { createFixture } from '../src/types'

/**
 * A `.map()` / `.filter()` callback reading its index inside another
 * callback's body. The outer callback travels to the runtime evaluator, which
 * binds a nested `.map` / `.filter` callback's `(item, index)` itself, so the
 * support gate admits the read there (#3477), while it refuses the same read
 * at the top level (`callback-index-param`).
 */
export const fixture = createFixture({
  id: 'callback-nested-index-param',
  description: 'A nested `.map()` / `.filter()` callback reading its index renders on every adapter',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function CallbackNestedIndexParam() {
  const [rows, setRows] = createSignal<string[][]>([['a', 'b'], ['c']])
  return (
    <div>
      <p>{rows().map(row => row.map((x, i) => i).join(',')).join(';')}</p>
      <p>{rows().map(row => row.filter((x, i) => i > 0).join(',')).join(';')}</p>
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test">
      <p bf="s1"><!--bf:s0-->0,1;0<!--/--></p>
      <p bf="s3"><!--bf:s2-->b;<!--/--></p>
    </div>
  `,
})
