import { createFixture } from '../src/types'

/**
 * Sibling of `text-then-conditional` / `conditional-then-text`: a
 * conditional renders with exactly the whitespace the source has around it —
 * the author's own spaces kept (`x {…} y`), none added (`[{…}]`) — for a
 * `&&` child, element branches, and a nested ternary.
 */
export const fixture = createFixture({
  id: 'conditional-text-adjacency-shapes',
  description: 'Conditionals keep exactly the source whitespace next to adjacent text',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function ConditionalTextAdjacencyShapes(props: { on?: boolean }) {
  const [a] = createSignal(true)
  return (
    <div>
      <p>x {a() ? 'on' : 'off'} y</p>
      <p>[{a() && 'shown'}]</p>
      <p>({props.on ? <b>yes</b> : <i>no</i>})</p>
      <p>a{a() ? (props.on ? '1' : '2') : '3'}b</p>
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test">
      <p bf="s2">x <!--bf-cond-start:s0--><!--bf:s1-->on<!--/--><!--bf-cond-end:s0--> y</p>
      <p bf="s4">[<!--bf-cond-start:s3-->shown<!--bf-cond-end:s3-->]</p>
      <p bf="s6">(<i bf-c="s5">no</i>)</p>
      <p bf="s9">a<!--bf-cond-start:s7--><!--bf-cond-start:s8-->2<!--bf-cond-end:s8--><!--bf-cond-end:s7-->b</p>
    </div>
  `,
})
