'use client'

// Test fixture: signal-driven loops whose row root is an element holding a
// child component (the composite-row plan: each row is built from a template
// with a placeholder for the child, which `upsertChild` then replaces). The
// child sits where the HTML parser moves a `<div>`: in a `<p>` inside an
// `<li>` row, in a `<tr>` row of a `<tbody>`, and in a `<g>` row of an
// `<svg>`. Rows added after mount are built from that template, so a `<div>`
// placeholder left the new row's child outside the row.

import { createSignal } from '@barefootjs/client'

type Item = { id: number; label: string }

function RowText(props: { text: string }) {
  return <em className="text">{props.text}</em>
}

function RowCell(props: { text: string }) {
  return <td className="cell">{props.text}</td>
}

function RowDot(props: { text: string }) {
  return <circle className="dot" r="1" data-text={props.text} />
}

export function CompositeRowChildRestrictedParent(props: { items: Item[] }) {
  const [rows, setRows] = createSignal<Item[]>(props.items)
  return (
    <div>
      <ul className="list">
        {rows().map(row => (
          <li key={row.id}>
            <p>
              <RowText text={row.label} />
            </p>
          </li>
        ))}
      </ul>
      <table>
        <tbody className="body">
          {rows().map(row => (
            <tr key={row.id}>
              <RowCell text={row.label} />
            </tr>
          ))}
        </tbody>
      </table>
      <svg className="pic" viewBox="0 0 4 4">
        {rows().map(row => (
          <g key={row.id}>
            <RowDot text={row.label} />
          </g>
        ))}
      </svg>
      <button type="button" className="add" onClick={() => setRows(r => [...r, { id: r.length + 1, label: 'n' + (r.length + 1) }])}>
        add
      </button>
    </div>
  )
}
