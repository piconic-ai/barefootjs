import { createFixture } from '../src/types'

/**
 * A `.map()` over an array prop of objects whose row is a child component
 * with forwarded JSX children read off the row
 * (`props.items.map(item => <Badge key={item.id}>{item.label}</Badge>)`).
 * Every row renders its own child component, key, and forwarded children.
 */
export const fixture = createFixture({
  id: 'loop-row-child-children-prop-array',
  description: "A component loop row over an array prop renders every row's forwarded children",
  source: `
'use client'

function Badge(props: { children?: any }) {
  return <em className="badge">{props.children}</em>
}

export function LoopRowChildChildrenPropArray(props: { items: { id: string; label: string }[] }) {
  return (
    <ul>
      {props.items.map(item => (
        <Badge key={item.id}>{item.label}</Badge>
      ))}
    </ul>
  )
}
`,
  props: {
    items: [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ],
  },
  expectedHtml: `
    <ul bf-s="test" bf="s2">
      <em bf-s="Badge_*" class="badge" data-key="a"><!--bf:^s0-->A<!--/--></em>
      <em bf-s="Badge_*" class="badge" data-key="b"><!--bf:^s0-->B<!--/--></em>
    </ul>
  `,
})
