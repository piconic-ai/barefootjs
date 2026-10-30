'use client'

// Root for the `const-alias-loop-shadow-hydrate` fixture. A component-scope
// const alias hop of a prop (`const a = label; const b = a`) is read inside
// loop rows that bind a name the hop passes through (`a`, or the prop's own
// name `label`). In JS the const reads the prop, so every row shows the
// label, not the row value, after hydration and in rows the client builds
// (`add`) or updates (`rename`) later.
//
// `PropsForm` is the `function C(props)` form: a renamed body destructure
// (`const { label: text } = props; const c = text`) read in rows that bind
// `text`. It owns its rows and buttons.
import { createSignal } from '@barefootjs/client'

function PropsForm(props: { label: string }) {
  const [rows, setRows] = createSignal([{ id: '1', name: 'r1' }, { id: '2', name: 'r2' }])
  const { label: text } = props
  const c = text
  return (
    <div className="props-form">
      <button className="add" onClick={() => setRows([...rows(), { id: '3', name: 'r3' }])}>add</button>
      <button className="rename" onClick={() => setRows(rows().map(r => (r.id === '1' ? { id: '1', name: 'x1' } : r)))}>rename</button>
      <ul>{rows().map(text => <li key={text.id} title={c}>{c}/{text.name}</li>)}</ul>
    </div>
  )
}

export function ConstAliasLoopShadowHydrate({ label }: { label: string }) {
  const [rows, setRows] = createSignal([{ id: '1', name: 'r1' }, { id: '2', name: 'r2' }])
  const a = label
  const b = a
  const c = label
  return (
    <div>
      <div className="root">
        <button className="add" onClick={() => setRows([...rows(), { id: '3', name: 'r3' }])}>add</button>
        <button className="rename" onClick={() => setRows(rows().map(r => (r.id === '1' ? { id: '1', name: 'x1' } : r)))}>rename</button>
      </div>
      <ul className="hop">
        {rows().map(a => (
          <li key={a.id} title={b} data-same={a.name === b ? 'y' : 'n'}>
            <span className="b">{b}</span>|<span className="row">{a.name}</span>|<span className="cond">{b ? 'on' : 'off'}</span>
            {b && <em>{b}</em>}
          </li>
        ))}
      </ul>
      <ul className="own">
        {rows().map(label => <li key={label.id} title={c}>{c}/{label.name}</li>)}
      </ul>
      <PropsForm label={label} />
    </div>
  )
}
