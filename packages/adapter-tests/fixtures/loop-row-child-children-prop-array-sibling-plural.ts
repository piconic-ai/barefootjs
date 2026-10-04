import { createFixture } from '../src/types'

/**
 * Sibling of `loop-row-child-children-prop-array`: the same component loop
 * with forwarded children over an array prop (`items`), next to a SECOND
 * component loop whose child's plural (`<Item>` → `Items`) is the same name
 * as that prop. Both loops render one component per row.
 */
export const fixture = createFixture({
  id: 'loop-row-child-children-prop-array-sibling-plural',
  description: "A component loop with forwarded children over an array prop renders every row when a sibling loop's child plural is the prop's name",
  source: `
'use client'

function Badge(props: { children?: any }) {
  return <em className="badge">{props.children}</em>
}

function Item(props: { id: string; label: string }) {
  return <i>{props.label}</i>
}

export function LoopRowChildChildrenPropArraySiblingPlural(props: {
  items: { id: string; meta: { label: string } }[]
  other: { id: string; label: string }[]
}) {
  return (
    <div>
      <ul>
        {props.items.map(row => (
          <Badge key={row.id}>{row.meta.label}</Badge>
        ))}
      </ul>
      <ol>
        {props.other.map(row => (
          <Item key={row.id} id={row.id} label={row.label} />
        ))}
      </ol>
    </div>
  )
}
`,
  props: {
    items: [
      { id: 'a', meta: { label: 'A' } },
      { id: 'b', meta: { label: 'B' } },
    ],
    other: [
      { id: 'x', label: 'X' },
      { id: 'y', label: 'Y' },
    ],
  },
  expectedHtml: `
    <div bf-s="test">
      <ul bf="s2">
        <em bf-s="Badge_*" class="badge" data-key="a"><!--bf:^s0-->A<!--/--></em>
        <em bf-s="Badge_*" class="badge" data-key="b"><!--bf:^s0-->B<!--/--></em>
      </ul>
      <ol bf="s4">
        <i bf-s="Item_*" bf="s1" data-key="x"><!--bf:s0-->X<!--/--></i>
        <i bf-s="Item_*" bf="s1" data-key="y"><!--bf:s0-->Y<!--/--></i>
      </ol>
    </div>
  `,
})
