/**
 * SolidJS SSR-bench app source — compiled TWICE by build.ts / render-server.ts
 * via babel-preset-solid: once with `generate: 'ssr', hydratable: true` (server
 * string render) and once with `generate: 'dom', hydratable: true` (client
 * hydration bundle). This is Solid's documented SSR pattern — one component
 * source, two compile targets — not two hand-written implementations.
 *
 * Same scenario as the React app: 1,000 rows from `initialRows`, row-label
 * click selects (via `createSelector` so unrelated rows never re-render),
 * no add/remove/update. `a.remove` has no handler (not part of this
 * scenario).
 */
import { createSignal, createSelector, For } from 'solid-js'

export interface RowData {
  id: number
  label: string
}

/**
 * Renders the bare `<table>` — no outer wrapping element, same reasoning
 * as the React app: the mount point (`<div id="app">`) lives in the
 * static HTML shell, not in this component's own tree, so
 * `hydrate(fn, node)` hydrates this table as `node`'s children.
 */
export function App(props: { initialRows: RowData[] }) {
  const [selected, setSelected] = createSignal(0)
  const isSelected = createSelector(selected)

  return (
    <table class="table">
      <tbody id="tbody">
        <For each={props.initialRows}>
          {(row) => (
            <tr class={isSelected(row.id) ? 'danger' : ''}>
              <td class="col-md-1">{row.id}</td>
              <td class="col-md-4">
                <a class="lbl" onClick={() => setSelected(row.id)}>
                  {row.label}
                </a>
              </td>
              <td class="col-md-1">
                <a class="remove">x</a>
              </td>
              <td class="col-md-6" />
            </tr>
          )}
        </For>
      </tbody>
    </table>
  )
}
