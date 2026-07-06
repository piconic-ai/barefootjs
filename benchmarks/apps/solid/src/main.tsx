import { batch, createSelector, createSignal, For, type Accessor, type Setter } from 'solid-js'
import { render } from 'solid-js/web'
import { buildData } from '../../shared/data'

/**
 * Row shape mirrors the official krausest keyed Solid implementation
 * (frameworks/keyed/solid/src/main.jsx): each row carries its own
 * `label` signal so `#update` can flip just the ten changed labels'
 * text nodes without touching row identity or DOM structure. `<For>`
 * keys by row-object reference, so as long as `update` never replaces
 * a row object (only calls its `setLabel`), reordering/select/remove
 * stay fine-grained and update never remounts a `<tr>`.
 */
interface Row {
  id: number
  label: Accessor<string>
  setLabel: Setter<string>
}

function buildRows(count: number): Row[] {
  return buildData(count).map(({ id, label }) => {
    const [get, set] = createSignal(label)
    return { id, label: get, setLabel: set }
  })
}

function App() {
  const [rows, setRows] = createSignal<Row[]>([])
  const [selected, setSelected] = createSignal<number>(0)
  const isSelected = createSelector(selected)

  const run = () => setRows(buildRows(1000))
  const runLots = () => setRows(buildRows(10000))
  const add = () => setRows((d) => [...d, ...buildRows(1000)])
  const update = () =>
    batch(() => {
      const d = rows()
      for (let i = 0; i < d.length; i += 10) d[i].setLabel((l) => l + ' !!!')
    })
  const clear = () => setRows([])
  const swapRows = () => {
    const list = rows().slice()
    if (list.length > 998) {
      const tmp = list[1]
      list[1] = list[998]
      list[998] = tmp
      setRows(list)
    }
  }
  const select = (id: number) => setSelected(id)
  const remove = (id: number) => setRows((d) => d.filter((row) => row.id !== id))

  return (
    <div id="main">
      <div class="jumbotron">
        <button id="run" onClick={run}>
          Create 1,000 rows
        </button>
        <button id="runlots" onClick={runLots}>
          Create 10,000 rows
        </button>
        <button id="add" onClick={add}>
          Append 1,000 rows
        </button>
        <button id="update" onClick={update}>
          Update every 10th row
        </button>
        <button id="clear" onClick={clear}>
          Clear
        </button>
        <button id="swaprows" onClick={swapRows}>
          Swap Rows
        </button>
      </div>
      <table class="table">
        <tbody id="tbody">
          <For each={rows()}>
            {(row) => (
              <tr class={isSelected(row.id) ? 'danger' : ''}>
                <td class="col-md-1">{row.id}</td>
                <td class="col-md-4">
                  <a class="lbl" onClick={() => select(row.id)}>
                    {row.label()}
                  </a>
                </td>
                <td class="col-md-1">
                  <a class="remove" onClick={() => remove(row.id)}>
                    x
                  </a>
                </td>
                <td class="col-md-6" />
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  )
}

render(() => <App />, document.body)
document.body.dataset.ready = '1'
