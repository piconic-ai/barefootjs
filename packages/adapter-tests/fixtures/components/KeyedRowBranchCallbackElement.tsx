'use client'

// Test fixture: a keyed `.map()` row whose conditional branch holds an
// element the caller's callback built (#3894). `Pill` keeps a click count,
// so the element has state of its own. Replacing every item under the same
// key must leave each mounted `Pill` in place, count included, however the
// row reaches the callback: called directly, through a bracket access, or
// through a local wrapper. The scalar list is the control: its branch calls
// a module function and follows the item.

import { createSignal } from '@barefootjs/client'

type Item = { id: number; label: string }

const shout = (s: string) => `${s}!`

function Pill(props: { label: string }) {
  const [count, setCount] = createSignal<number>(0)
  return (
    <button type="button" className="pill" onClick={() => setCount(count() + 1)}>
      {props.label}:{count()}
    </button>
  )
}

function CallbackRows(props: { renderItem?: (item: Item) => unknown }) {
  const [items, setItems] = createSignal<Item[]>([
    { id: 1, label: 'a' },
    { id: 2, label: 'b' },
  ])
  const draw = (item: Item) => props.renderItem!(item)
  return (
    <div>
      <button type="button" className="relabel" onClick={() => setItems(items().map(i => ({ ...i, label: `${i.label}x` })))}>
        relabel
      </button>
      <ul className="direct">
        {items().map(item => (
          <li key={item.id}>{props.renderItem ? props.renderItem(item) : <span>{item.label}</span>}</li>
        ))}
      </ul>
      <ul className="bracket">
        {items().map(item => (
          <li key={item.id}>{props.renderItem ? props['renderItem'](item) : <span>{item.label}</span>}</li>
        ))}
      </ul>
      <ul className="wrapper">
        {items().map(item => (
          <li key={item.id}>{props.renderItem ? draw(item) : <span>{item.label}</span>}</li>
        ))}
      </ul>
      <ul className="scalar">
        {items().map(item => (
          <li key={item.id}>{item.id > 0 ? shout(item.label) : 'none'}</li>
        ))}
      </ul>
    </div>
  )
}

export function KeyedRowBranchCallbackElement() {
  return <CallbackRows renderItem={item => <Pill label={item.label} />} />
}
