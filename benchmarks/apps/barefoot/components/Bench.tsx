'use client'

import { createSignal } from '@barefootjs/client'

// Row-data generator inlined from benchmarks/apps/shared/data.ts (krausest
// js-framework-benchmark parity — same adjectives/colours/nouns, same
// Math.random() formula, same monotonically-increasing id).
//
// NOTE ON WHY THIS IS INLINED RATHER THAN IMPORTED: BarefootJS's compiler
// DOES support a 'use client' component importing a sibling .ts helper via
// module-relative imports — resolveRelativeImports() in
// packages/cli/src/lib/resolve-imports.ts inlines it into the compiled
// client JS as a top-level IIFE. But that inlining is keyed off
// `sourceDirsByManifestKey`, which packages/cli/src/lib/build.ts only
// populates from `result.manifestKey` — and `compileEntry()`
// (packages/cli/src/lib/build.ts ~line 1878) only sets `manifestKey` inside
// `if (!config.clientOnly && markedTemplates.length > 0)`. CSR builds
// (`@barefootjs/client/build`'s `createConfig()`) always set
// `clientOnly: true`, so `markedTemplates.length` is always 0 and
// `manifestKey` is always null for every CSR component — so
// `sourceDirsByManifestKey` is always empty and the sibling-.ts-helper
// inlining feature never fires in CSR (clientOnly) mode. Importing
// `buildData` from `../../shared/data` compiled cleanly but left the
// import specifier unresolved verbatim in the emitted client JS, which
// 404'd in the browser (the relative path has no equivalent file at that
// depth under dist/). This is a CLI limitation specific to `clientOnly`
// builds, not a JSX/IR compiler restriction — reported here rather than
// worked around with hand-written DOM.
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
            <tr key={row.id} className={selected() === row.id ? 'danger' : ''}>
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
