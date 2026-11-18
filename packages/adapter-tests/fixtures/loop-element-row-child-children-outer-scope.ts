import { createFixture } from '../src/types'

/**
 * A component nested in an element loop row whose forwarded children read
 * what the row itself can see: a prop and a signal of the enclosing
 * component, the row's index, and, from a nested loop, both rows
 * (`<li><Chip>{props.pre}{count()}{i}{o.tags.map(t => <b>{t}{o.id}{i}</b>)}</Chip></li>`).
 */
export const fixture = createFixture({
  id: 'loop-element-row-child-children-outer-scope',
  description: "A component in an element loop row forwards children that read the enclosing component's state, the row index and an enclosing row from a nested loop",
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

function Chip(props: { children?: any }) {
  return <em>{props.children}</em>
}

export function LoopElementRowChildChildrenOuterScope(props: { pre: string; items: { id: string; tags: string[] }[] }) {
  const [count] = createSignal(3)
  return (
    <ul>
      {props.items.map((o, i) => (
        <li key={o.id}>
          <Chip>{props.pre}{count()}{i}{o.tags.map(t => <b key={t}>{t}{o.id}{i}</b>)}</Chip>
        </li>
      ))}
    </ul>
  )
}
`,
  props: { pre: 'P', items: [{ id: 'a', tags: ['x', 'y'] }, { id: 'b', tags: [] }] },
  expectedHtml: `
    <ul bf-s="test" bf="s7">
      <li data-key="a"><em bf-s="test_s6"><!--bf:^s0-->P<!--/--><!--bf:^s1-->3<!--/--><!--bf:^s2-->0<!--/--><b data-key-1="x"><!--bf:^s3-->x<!--/--><!--bf:^s4-->a<!--/--><!--bf:^s5-->0<!--/--></b><b data-key-1="y"><!--bf:^s3-->y<!--/--><!--bf:^s4-->a<!--/--><!--bf:^s5-->0<!--/--></b></em></li>
      <li data-key="b"><em bf-s="test_s6"><!--bf:^s0-->P<!--/--><!--bf:^s1-->3<!--/--><!--bf:^s2-->1<!--/--></em></li>
    </ul>
  `,
})
