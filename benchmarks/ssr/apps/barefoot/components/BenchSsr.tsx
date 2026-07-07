'use client'

import { createSignal } from '@barefootjs/client'

/**
 * BarefootJS SSR-bench component — same scenario as the React/Solid apps:
 * 1,000 rows delivered via `initialRows` prop, row-label click selects
 * exactly one row (danger class), no add/remove/update. `a.remove` has no
 * handler (not part of this scenario).
 *
 * Props flow via the framework's real mechanism: the Hono adapter embeds
 * `initialRows` in the SSR'd `bf-p` attribute on this component's root
 * scope element (see spec/compiler.md's hydration protocol), and the
 * compiled client JS reads it back from that attribute on hydration — the
 * same path any BarefootJS app takes for server-to-client prop delivery.
 * That is the honest cost being measured here: no hand-optimized
 * alternative data channel.
 */
interface RowData {
  id: number
  label: string
}

export function BenchSsr(props: { initialRows: RowData[] }) {
  const [selected, setSelected] = createSignal(0)

  return (
    <table className="table">
      <tbody id="tbody">
        {props.initialRows.map(row => (
          <tr key={row.id} className={selected() === row.id ? 'danger' : ''}>
            <td className="col-md-1">{row.id}</td>
            <td className="col-md-4">
              <a className="lbl" onClick={() => setSelected(row.id)}>{row.label}</a>
            </td>
            <td className="col-md-1"><a className="remove">x</a></td>
            <td className="col-md-6"></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default BenchSsr
