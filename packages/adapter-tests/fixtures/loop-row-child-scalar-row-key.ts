import { createFixture } from '../src/types'

/**
 * A `.map()` over an array prop of strings whose row is a child component
 * with no children, keyed by the row value itself
 * (`props.items.map(i => <Badge key={i} label={i} />)`). The key is the
 * whole row, not a field of it, so every row renders with its own
 * `data-key` and label.
 */
export const fixture = createFixture({
  id: 'loop-row-child-scalar-row-key',
  description: 'A component loop row over a string array prop, keyed by the row value itself, renders every row with its own key',
  source: `
'use client'

function Badge(props: { label: string }) {
  return <em className="badge">{props.label}</em>
}

export function LoopRowChildScalarRowKey(props: { items: string[] }) {
  return (
    <ul>
      {props.items.map(i => (
        <Badge key={i} label={i} />
      ))}
    </ul>
  )
}
`,
  props: {
    items: ['a', 'b'],
  },
  expectedHtml: `
    <ul bf-s="test" bf="s1">
      <em bf-s="Badge_*" bf="s1" class="badge" data-key="a"><!--bf:s0-->a<!--/--></em>
      <em bf-s="Badge_*" bf="s1" class="badge" data-key="b"><!--bf:s0-->b<!--/--></em>
    </ul>
  `,
})
