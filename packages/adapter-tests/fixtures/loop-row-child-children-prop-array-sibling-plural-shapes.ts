import { createFixture } from '../src/types'

/**
 * Sibling of `loop-row-child-children-prop-array-sibling-plural`: two pairs
 * of loops where one loop's child plural is the OTHER loop's array prop
 * name (`<Item>` → `Items` next to `items`, `<Entry>` → `Entries` next to
 * `entries`), with either side of a pair empty. Each loop renders exactly
 * its own array's rows.
 */
export const fixture = createFixture({
  id: 'loop-row-child-children-prop-array-sibling-plural-shapes',
  description: "Sibling component loops keep their own rows when one loop's child plural is the other's array prop name and either array is empty",
  source: `
'use client'

function Badge(props: { children?: any }) {
  return <em className="badge">{props.children}</em>
}

function Item(props: { id: string; label: string }) {
  return <i>{props.label}</i>
}

function Card(props: { children?: any }) {
  return <q className="card">{props.children}</q>
}

function Entry(props: { id: string; label: string }) {
  return <b>{props.label}</b>
}

type Row = { id: string; meta: { label: string } }
type Plain = { id: string; label: string }

export function SiblingPluralShapes(props: { items: Row[]; other: Plain[]; entries: Row[]; list: Plain[] }) {
  return (
    <div>
      <ul className="items">
        {props.items.map(row => (
          <Badge key={row.id}>{row.meta.label}</Badge>
        ))}
      </ul>
      <ol className="other">
        {props.other.map(row => (
          <Item key={row.id} id={row.id} label={row.label} />
        ))}
      </ol>
      <ul className="entries">
        {props.entries.map(row => (
          <Card key={row.id}>{row.meta.label}</Card>
        ))}
      </ul>
      <ol className="list">
        {props.list.map(row => (
          <Entry key={row.id} id={row.id} label={row.label} />
        ))}
      </ol>
    </div>
  )
}
`,
  props: {
    items: [],
    other: [
      { id: 'x', label: 'X' },
      { id: 'y', label: 'Y' },
    ],
    entries: [
      { id: 'e1', meta: { label: 'E1' } },
      { id: 'e2', meta: { label: 'E2' } },
    ],
    list: [],
  },
  expectedHtml: `
    <div bf-s="test">
      <ul bf="s2" class="items"></ul>
      <ol bf="s4" class="other">
        <i bf-s="Item_*" bf="s1" data-key="x"><!--bf:s0-->X<!--/--></i>
        <i bf-s="Item_*" bf="s1" data-key="y"><!--bf:s0-->Y<!--/--></i>
      </ol>
      <ul bf="s7" class="entries">
        <q bf-s="Card_*" class="card" data-key="e1"><!--bf:^s5-->E1<!--/--></q>
        <q bf-s="Card_*" class="card" data-key="e2"><!--bf:^s5-->E2<!--/--></q>
      </ul>
      <ol bf="s9" class="list"></ol>
    </div>
  `,
})
