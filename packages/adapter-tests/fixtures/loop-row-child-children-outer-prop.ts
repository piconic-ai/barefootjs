import { createFixture } from '../src/types'

/**
 * A component loop row over an array prop whose forwarded children read a
 * prop of the enclosing component off its props object
 * (`<Chip key={o.id}>{props.pre}<i>{o.label}</i></Chip>`).
 */
export const fixture = createFixture({
  id: 'loop-row-child-children-outer-prop',
  description: "A component loop row's forwarded children read a prop of the enclosing component",
  source: `
'use client'

function Chip(props: { children?: any }) {
  return <em>{props.children}</em>
}

export function LoopRowChildChildrenOuterProp(props: { pre: string; items: { id: string; label: string }[] }) {
  return (
    <ul>
      {props.items.map(o => (
        <Chip key={o.id}>{props.pre}<i>{o.label}</i></Chip>
      ))}
    </ul>
  )
}
`,
  props: { pre: 'P:', items: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] },
  expectedHtml: `
    <ul bf-s="test" bf="s3">
      <em bf-s="Chip_*" data-key="a"><!--bf:^s0-->P:<!--/--><i><!--bf:^s1-->A<!--/--></i></em>
      <em bf-s="Chip_*" data-key="b"><!--bf:^s0-->P:<!--/--><i><!--bf:^s1-->B<!--/--></i></em>
    </ul>
  `,
})
