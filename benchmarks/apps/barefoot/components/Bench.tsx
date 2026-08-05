'use client'

import { createSignal, createSelector } from '@barefootjs/client'

// Row-data generator inlined from benchmarks/apps/shared/data.ts (krausest
// js-framework-benchmark parity — same adjectives/colours/nouns, same
// Math.random() formula, same monotonically-increasing id).
//
// NOTE ON WHY THIS IS INLINED RATHER THAN IMPORTED: this app predates the
// Vite migration (PR 7a-7c), when the legacy `bf build` CLI's `clientOnly`
// (CSR) mode never inlined a sibling `.ts` helper import — see history for
// the removed `packages/cli/src/lib/resolve-imports.ts`/`build.ts` for the
// mechanism that gated it. Real ESM `import` resolution is now Vite's own
// job, so `import { buildData } from '../../shared/data'` would very
// likely bundle correctly today. Left inlined rather than re-verified —
// no functional need to change it.
const adjectives = [
  'pretty', 'large', 'big', 'small', 'tall', 'short', 'long', 'handsome',
  'plain', 'quaint', 'clean', 'elegant', 'easy', 'angry', 'crazy', 'helpful',
  'mushy', 'odd', 'unsightly', 'adorable', 'important', 'inexpensive',
  'cheap', 'expensive', 'fancy',
]

const colours = [
  'red', 'yellow', 'blue', 'green', 'pink', 'brown', 'purple', 'brown',
  'white', 'black', 'orange',
]

const nouns = [
  'table', 'chair', 'house', 'bbq', 'desk', 'car', 'pony', 'cookie',
  'sandwich', 'burger', 'pizza', 'mouse', 'keyboard',
]

interface RowData {
  id: number
  label: string
}

let nextId = 1

function random(max: number): number {
  return Math.round(Math.random() * 1000) % max
}

function buildData(count: number): RowData[] {
  const data: RowData[] = new Array(count)
  for (let i = 0; i < count; i++) {
    data[i] = {
      id: nextId++,
      label: `${adjectives[random(adjectives.length)]} ${colours[random(colours.length)]} ${nouns[random(nouns.length)]}`,
    }
  }
  return data
}

function Bench() {
  const [rows, setRows] = createSignal<RowData[]>([])
  const [selected, setSelected] = createSignal<number>(0)
  const isSelected = createSelector(selected)

  const run = () => {
    setSelected(0)
    setRows(buildData(1000))
  }

  const runLots = () => {
    setSelected(0)
    setRows(buildData(10000))
  }

  const add = () => {
    setRows([...rows(), ...buildData(1000)])
  }

  const update = () => {
    const data = rows()
    const next = data.slice()
    for (let i = 0; i < next.length; i += 10) {
      const r = next[i]
      next[i] = { id: r.id, label: r.label + ' !!!' }
    }
    setRows(next)
  }

  const clear = () => {
    setSelected(0)
    setRows([])
  }

  const swapRows = () => {
    const data = rows()
    if (data.length < 999) return
    const next = data.slice()
    const tmp = next[1]
    next[1] = next[998]
    next[998] = tmp
    setRows(next)
  }

  const select = (id: number) => setSelected(id)

  const remove = (id: number) => {
    setRows(rows().filter(r => r.id !== id))
  }

  return (
    <div id="main">
      <div className="jumbotron">
        <button id="run" onClick={run}>Create 1,000 rows</button>
        <button id="runlots" onClick={runLots}>Create 10,000 rows</button>
        <button id="add" onClick={add}>Append 1,000 rows</button>
        <button id="update" onClick={update}>Update every 10th row</button>
        <button id="clear" onClick={clear}>Clear</button>
        <button id="swaprows" onClick={swapRows}>Swap Rows</button>
      </div>
      <table className="table">
        <tbody id="tbody">
          {rows().map(row => (
            <tr key={row.id} className={isSelected(row.id) ? 'danger' : ''}>
              <td className="col-md-1">{row.id}</td>
              <td className="col-md-4">
                <a className="lbl" onClick={() => select(row.id)}>{row.label}</a>
              </td>
              <td className="col-md-1">
                <a className="remove" onClick={() => remove(row.id)}>x</a>
              </td>
              <td className="col-md-6"></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default Bench
