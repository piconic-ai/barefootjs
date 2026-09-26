import { createFixture } from '../src/types'

/**
 * A `.map()` over an array prop of objects whose row is a child component
 * keyed by a row field the component takes no prop for
 * (`<Badge key={item.id} label={item.label} />` — `Badge` has `label`, not
 * `id`). The key is the row object's own field, not one of the child's
 * props, so every row renders with its own `data-key` and label.
 */
export const fixture = createFixture({
  id: 'loop-row-child-key-not-a-prop',
  description: 'A component loop row keyed by a row field the component takes no prop for renders every row with its own key',
  source: `
'use client'

function Badge(props: { label: string }) {
  return <em className="badge">{props.label}</em>
}

export function LoopRowChildKeyNotAProp(props: { items: { id: string; label: string }[] }) {
  return (
    <ul>
      {props.items.map(item => (
        <Badge key={item.id} label={item.label} />
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
    <ul bf-s="test" bf="s1">
      <em bf-s="Badge_*" bf="s1" class="badge" data-key="a"><!--bf:s0-->A<!--/--></em>
      <em bf-s="Badge_*" bf="s1" class="badge" data-key="b"><!--bf:s0-->B<!--/--></em>
    </ul>
  `,
})
