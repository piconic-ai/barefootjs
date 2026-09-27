import { createFixture } from '../src/types'

/**
 * A `.map()` over an array prop of objects whose row is a child component
 * keyed by a row field that the component ALSO takes a same-named prop for,
 * passed a DIFFERENT row field (`<Badge key={item.id} id={item.slug} … />`).
 * The key is the row object's own `id`, not the child's `id` prop, so every
 * row renders `data-key` from `item.id` (`a`, `b`) and `data-id` from
 * `item.slug` (`x`, `y`).
 */
export const fixture = createFixture({
  id: 'loop-row-child-key-shadowed-by-prop',
  description: 'A component loop row keyed by a row field whose name the component also takes as a prop keys each row by the row field, not the prop',
  source: `
'use client'

function Badge(props: { id: string; label: string }) {
  return <em className="badge" data-id={props.id}>{props.label}</em>
}

export function LoopRowChildKeyShadowedByProp(props: { items: { id: string; slug: string; label: string }[] }) {
  return (
    <ul>
      {props.items.map(item => (
        <Badge key={item.id} id={item.slug} label={item.label} />
      ))}
    </ul>
  )
}
`,
  props: {
    items: [
      { id: 'a', slug: 'x', label: 'A' },
      { id: 'b', slug: 'y', label: 'B' },
    ],
  },
  expectedHtml: `
    <ul bf-s="test" bf="s1">
      <em bf-s="Badge_*" bf="s1" class="badge" data-id="x" data-key="a"><!--bf:s0-->A<!--/--></em>
      <em bf-s="Badge_*" bf="s1" class="badge" data-id="y" data-key="b"><!--bf:s0-->B<!--/--></em>
    </ul>
  `,
})
