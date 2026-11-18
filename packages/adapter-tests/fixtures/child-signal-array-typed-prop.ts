import { createFixture } from '../src/types'

/**
 * A signal seeded with a string array literal, read whole into a static
 * child's `string[]` prop (`<List items={items()} />`).
 */
export const fixture = createFixture({
  id: 'child-signal-array-typed-prop',
  description: "A signal seeded with a string array literal reaches a static child's string[] prop",
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

function List(props: { items: string[] }) {
  return <ul>{props.items.map(i => <li key={i}>{i}</li>)}</ul>
}

export function ChildSignalArrayTypedProp() {
  const [items] = createSignal(['a', 'b'])
  return <div><List items={items()} /></div>
}
`,
  expectedHtml: `
    <div bf-s="test"><ul bf-s="test_s0" bf="s1"><li data-key="a"><!--bf:s0-->a<!--/--></li><li data-key="b"><!--bf:s0-->b<!--/--></li></ul></div>
  `,
})
