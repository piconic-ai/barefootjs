import { createFixture } from '../src/types'

/**
 * Sibling of `loop-set-bound-param-shadow` (#3391): a `.map()` callback's
 * preamble local named like a memo shadows it only inside the row, and the
 * memo still renders its own value after the loop.
 */
export const fixture = createFixture({
  id: 'loop-preamble-local-shadow',
  description: 'A preamble local named like a memo leaves the memo intact after the loop',
  source: `
'use client'
import { createMemo, createSignal } from '@barefootjs/client'
export function LoopPreambleLocalShadow(props: { groups: { name: string; tags: string[] }[] }) {
  const [n] = createSignal(3)
  const total = createMemo(() => n() + 1)
  return (
    <div>
      <ul>{props.groups.map(g => {
        const total = g.tags.length
        return <li key={g.name}>{g.name}:{total}</li>
      })}</ul>
      <p data-total={total()}>x</p>
    </div>
  )
}
`,
  props: { groups: [{ name: 'g1', tags: ['a', 'b'] }, { name: 'g2', tags: ['c'] }] },
  expectedHtml: `
    <div bf-s="test">
      <ul bf="s3">
        <li bf="s2" data-key="g1"><!--bf:s0-->g1<!--/-->:<!--bf:s1-->2<!--/--></li>
        <li bf="s2" data-key="g2"><!--bf:s0-->g2<!--/-->:<!--bf:s1-->1<!--/--></li>
      </ul>
      <p bf="s4" data-total="4">x</p>
    </div>
  `,
})
