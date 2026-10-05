import { createFixture } from '../src/types'

/**
 * Sibling of `loop-row-child-children-prop-array-sibling-plural-shapes`: a
 * `<Item>` loop whose plural `Items` is claimed by the `items` prop is
 * renamed to `<Item>Rows`, next to an `<ItemRow>` loop whose ordinary plural
 * is that same name. Each loop renders exactly its own array's rows.
 */
export const fixture = createFixture({
  id: 'loop-row-child-renamed-rows-sibling-plural',
  description: "A renamed component-loop rows field does not collide with a sibling loop's plural",
  source: `
'use client'

function Item(props: { id: string; label: string }) {
  return <i>{props.label}</i>
}

function ItemRow(props: { id: string; label: string }) {
  return <b>{props.label}</b>
}

type Plain = { id: string; label: string }

export function RenamedRowsSiblingPlural(props: { items: Plain[]; other: Plain[]; rows: Plain[] }) {
  return (
    <div>
      <p className="count">{props.items.length}</p>
      <ol className="other">
        {props.other.map(row => (
          <Item key={row.id} id={row.id} label={row.label} />
        ))}
      </ol>
      <ul className="rows">
        {props.rows.map(row => (
          <ItemRow key={row.id} id={row.id} label={row.label} />
        ))}
      </ul>
    </div>
  )
}
`,
  props: {
    items: [{ id: 'i', label: 'I' }],
    other: [
      { id: 'x', label: 'X' },
      { id: 'y', label: 'Y' },
    ],
    rows: [{ id: 'r', label: 'R' }],
  },
  expectedHtml: `
    <div bf-s="test">
      <p bf="s1" class="count"><!--bf:s0-->1<!--/--></p>
      <ol bf="s3" class="other">
        <i bf-s="Item_*" bf="s1" data-key="x"><!--bf:s0-->X<!--/--></i>
        <i bf-s="Item_*" bf="s1" data-key="y"><!--bf:s0-->Y<!--/--></i>
      </ol>
      <ul bf="s5" class="rows"><b bf-s="ItemRow_*" bf="s1" data-key="r"><!--bf:s0-->R<!--/--></b></ul>
    </div>
  `,
})
