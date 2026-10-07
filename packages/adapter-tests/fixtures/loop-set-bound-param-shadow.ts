import { createFixture } from '../src/types'

/**
 * `.map()` params a template binds with a body-level assignment — an index
 * named like a signal, a destructure binding named like a prop — shadow
 * the outer name only inside the row (#3386). The signal and the prop still
 * render their own values after the loop.
 */
export const fixture = createFixture({
  id: 'loop-set-bound-param-shadow',
  description: 'An index or destructure param named like a signal or prop leaves it intact after the loop',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function LoopSetBoundParamShadow(props: { rows: { name: string }[]; name: string }) {
  const [count] = createSignal(7)
  return (
    <div>
      <ul>{props.rows.map(({ name }, count) => <li key={name}>{name}-{count}</li>)}</ul>
      <p data-count={count()}>{props.name}</p>
    </div>
  )
}
`,
  props: { rows: [{ name: 'a' }, { name: 'b' }], name: 'outer' },
  expectedHtml: `
    <div bf-s="test">
      <ul bf="s3">
        <li bf="s2" data-key="a"><!--bf:s0-->a<!--/-->-<!--bf:s1-->0<!--/--></li>
        <li bf="s2" data-key="b"><!--bf:s0-->b<!--/-->-<!--bf:s1-->1<!--/--></li>
      </ul>
      <p bf="s5" data-count="7"><!--bf:s4-->outer<!--/--></p>
    </div>
  `,
})
