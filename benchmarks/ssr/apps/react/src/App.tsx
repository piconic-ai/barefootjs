/**
 * React 19 SSR-bench app: a single 1,000-row table rendered from
 * `initialRows`, with row-label click selecting exactly one row.
 *
 * No jumbotron / no add / remove / update — per benchmarks/ssr scenario
 * design, the SSR + hydration bench measures one thing (create + hydrate
 * + select), not the full krausest operation set (that's what
 * benchmarks/apps/react covers). Row markup shape (four `<td>`s, `a.lbl`,
 * `a.remove`) mirrors CONTRACT.md so the rendered HTML is byte-comparable
 * in structure to the DOM-suite app and to the solid/barefoot SSR apps.
 * `a.remove` has no handler — removal is not part of this scenario, so no
 * framework should pay for wiring a listener that's never used.
 */
import { memo, useState } from 'react'

export interface RowData {
  id: number
  label: string
}

interface RowProps {
  row: RowData
  selected: boolean
  onSelect: (id: number) => void
}

const Row = memo(
  function Row({ row, selected, onSelect }: RowProps) {
    return (
      <tr className={selected ? 'danger' : ''}>
        <td className="col-md-1">{row.id}</td>
        <td className="col-md-4">
          <a className="lbl" onClick={() => onSelect(row.id)}>
            {row.label}
          </a>
        </td>
        <td className="col-md-1">
          <a className="remove">x</a>
        </td>
        <td className="col-md-6" />
      </tr>
    )
  },
  (prev, next) => prev.selected === next.selected && prev.row === next.row,
)

/**
 * Renders the bare `<table>` — no outer wrapping element. The mount
 * point (`<div id="app">`) is the static HTML shell in dist/index.html,
 * NOT part of this component's own tree: `hydrateRoot(container, <App/>)`
 * hydrates `<App/>`'s output as `container`'s *children*, so if `App`
 * rendered its own `id="app"` div the container and its lone child would
 * both carry `id="app"` — a mismatch. Same reasoning applies to Solid's
 * `hydrate(fn, node)`.
 */
export function App({ initialRows }: { initialRows: RowData[] }) {
  const [selected, setSelected] = useState(0)
  return (
    <table className="table">
      <tbody id="tbody">
        {initialRows.map((row) => (
          <Row key={row.id} row={row} selected={selected === row.id} onSelect={setSelected} />
        ))}
      </tbody>
    </table>
  )
}
