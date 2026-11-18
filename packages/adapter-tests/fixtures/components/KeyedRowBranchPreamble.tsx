'use client'

// Test fixture: a keyed `.map()` row whose callback-preamble local feeds both
// branches of a conditional (#3913). Each button changes what the local is
// computed from AND flips every row's condition in the same update, so the
// row is reused and its branch swaps. The swapped-in branch has to show the
// local computed from the row's current item, not the value the row was
// first rendered with. The local feeds a text, an attribute and a branch
// nested in the other one. The index and outer-signal sources are in
// `KeyedRowBranchPreambleIndex` and `KeyedRowBranchPreambleSignal`.

import { createSignal } from '@barefootjs/client'

type Row = { id: string; name: string; on: boolean }

export function KeyedRowBranchPreamble() {
  const [byItem, setByItem] = createSignal<Row[]>([
    { id: 'a', name: 'x', on: true },
    { id: 'b', name: 'y', on: false },
  ])
  const [byAttr, setByAttr] = createSignal<Row[]>([
    { id: 'a', name: 'x', on: true },
    { id: 'b', name: 'y', on: false },
  ])
  const [byNested, setByNested] = createSignal<Row[]>([
    { id: 'a', name: 'x', on: true },
    { id: 'b', name: 'y', on: false },
  ])
  return (
    <div>
      <button type="button" className="item" onClick={() => setByItem(byItem().map(r => ({ ...r, on: !r.on, name: `${r.name}z` })))}>
        item
      </button>
      <button type="button" className="attr" onClick={() => setByAttr(byAttr().map(r => ({ ...r, on: !r.on, name: `${r.name}z` })))}>
        attr
      </button>
      <button type="button" className="nested" onClick={() => setByNested(byNested().map(r => ({ ...r, on: !r.on, name: `${r.name}z` })))}>
        nested
      </button>
      <ul className="item">
        {byItem().map(row => {
          const label = '[' + row.name + ']'
          return <li key={row.id}>{row.on ? <b>{label}</b> : <i>{label}</i>}</li>
        })}
      </ul>
      <ul className="attr">
        {byAttr().map(row => {
          const label = '[' + row.name + ']'
          return <li key={row.id}>{row.on ? <b title={label}>on</b> : <i title={label}>off</i>}</li>
        })}
      </ul>
      <ul className="nested">
        {byNested().map(row => {
          const label = '[' + row.name + ']'
          return (
            <li key={row.id}>
              {row.on ? row.name.length > 1 ? <b>{label}</b> : <u>{label}</u> : <i>{label}</i>}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
