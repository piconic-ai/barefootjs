'use client'

// Test fixture: a child-component prop whose name starts with `on` but is
// not an event handler (`once` — `on` followed by a lowercase letter). It
// is data, fed from an outer signal, and must update on the child after a
// signal write like any other reactive prop — at a top-level call site, on
// a component nested in an element loop row, and on the loop-row
// component itself. Only `on` + an uppercase letter (`onClick`) is an
// event handler.

import { createSignal } from '@barefootjs/client'

function Badge(props: { once?: boolean; label: string }) {
  return (
    <em className="badge" data-label={props.label} data-once={props.once ? 'yes' : 'no'}>
      {props.once ? 'on' : 'off'}
    </em>
  )
}

type Opt = { id: string; label: string }

export function OnPrefixedDataProp() {
  const [flag, setFlag] = createSignal(true)
  const [opts] = createSignal<Opt[]>([
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
  ])

  return (
    <div>
      <p className="top">
        <Badge once={flag()} label="top" />
      </p>
      <ul className="rows">
        {opts().map(o => (
          <li key={o.id}>
            <Badge once={flag()} label={o.label} />
          </li>
        ))}
      </ul>
      <p className="direct">
        {opts().map(o => (
          <Badge key={o.id} once={flag()} label={o.label} />
        ))}
      </p>
      <button type="button" className="toggle" onClick={() => setFlag(v => !v)}>
        toggle
      </button>
    </div>
  )
}
