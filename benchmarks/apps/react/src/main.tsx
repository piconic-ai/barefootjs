/**
 * React 19 benchmark app — modeled on the official krausest
 * js-framework-benchmark `keyed/react-hooks` implementation
 * (frameworks/keyed/react-hooks/src/main.jsx): a single `useReducer` for
 * the whole list + selection, a `memo`ized `Row` with a custom equality
 * function that only checks `selected` and `item` identity, and a stable
 * `dispatch` (from `useReducer`, never changes identity) threaded straight
 * through instead of per-row `useCallback` wrappers.
 *
 * Markup follows benchmarks/CONTRACT.md exactly (button ids, `#tbody`,
 * `a.lbl` / `a.remove` classes) rather than krausest's Bootstrap markup.
 */
import { type Dispatch, memo, useEffect, useReducer } from 'react'
import { createRoot } from 'react-dom/client'
import { buildData, type RowData } from '../../shared/data.ts'

interface ListState {
  data: RowData[]
  selected: number
}

type ListAction =
  | { type: 'RUN' }
  | { type: 'RUN_LOTS' }
  | { type: 'ADD' }
  | { type: 'UPDATE' }
  | { type: 'CLEAR' }
  | { type: 'SWAP_ROWS' }
  | { type: 'REMOVE'; id: number }
  | { type: 'SELECT'; id: number }

const initialState: ListState = { data: [], selected: 0 }

function listReducer(state: ListState, action: ListAction): ListState {
  const { data, selected } = state

  switch (action.type) {
    case 'RUN':
      return { data: buildData(1000), selected: 0 }
    case 'RUN_LOTS':
      return { data: buildData(10000), selected: 0 }
    case 'ADD':
      return { data: data.concat(buildData(1000)), selected }
    case 'UPDATE': {
      const newData = data.slice(0)
      for (let i = 0; i < newData.length; i += 10) {
        const r = newData[i]
        if (r) newData[i] = { id: r.id, label: `${r.label} !!!` }
      }
      return { data: newData, selected }
    }
    case 'CLEAR':
      return { data: [], selected: 0 }
    case 'SWAP_ROWS': {
      const newData = data.slice(0)
      if (data.length > 998) {
        const d1 = newData[1]
        const d998 = newData[998]
        if (d1 && d998) {
          newData[1] = d998
          newData[998] = d1
        }
      }
      return { data: newData, selected }
    }
    case 'REMOVE': {
      const idx = data.findIndex((d) => d.id === action.id)
      return { data: [...data.slice(0, idx), ...data.slice(idx + 1)], selected }
    }
    case 'SELECT':
      return { data, selected: action.id }
    default:
      return state
  }
}

interface RowProps {
  item: RowData
  selected: boolean
  dispatch: Dispatch<ListAction>
}

const Row = memo(
  ({ selected, item, dispatch }: RowProps) => (
    <tr className={selected ? 'danger' : ''}>
      <td className="col-md-1">{item.id}</td>
      <td className="col-md-4">
        <a className="lbl" onClick={() => dispatch({ type: 'SELECT', id: item.id })}>
          {item.label}
        </a>
      </td>
      <td className="col-md-1">
        <a className="remove" onClick={() => dispatch({ type: 'REMOVE', id: item.id })}>
          x
        </a>
      </td>
      <td className="col-md-6" />
    </tr>
  ),
  (prevProps, nextProps) => prevProps.selected === nextProps.selected && prevProps.item === nextProps.item,
)

function Main() {
  const [{ data, selected }, dispatch] = useReducer(listReducer, initialState)

  useEffect(() => {
    document.body.dataset.ready = '1'
  }, [])

  return (
    <>
      <div className="jumbotron">
        <button type="button" id="run" onClick={() => dispatch({ type: 'RUN' })}>
          Create 1,000 rows
        </button>
        <button type="button" id="runlots" onClick={() => dispatch({ type: 'RUN_LOTS' })}>
          Create 10,000 rows
        </button>
        <button type="button" id="add" onClick={() => dispatch({ type: 'ADD' })}>
          Append 1,000 rows
        </button>
        <button type="button" id="update" onClick={() => dispatch({ type: 'UPDATE' })}>
          Update every 10th row
        </button>
        <button type="button" id="clear" onClick={() => dispatch({ type: 'CLEAR' })}>
          Clear
        </button>
        <button type="button" id="swaprows" onClick={() => dispatch({ type: 'SWAP_ROWS' })}>
          Swap Rows
        </button>
      </div>
      <table className="table">
        <tbody id="tbody">
          {data.map((item) => (
            <Row key={item.id} item={item} selected={selected === item.id} dispatch={dispatch} />
          ))}
        </tbody>
      </table>
    </>
  )
}

const container = document.getElementById('main')
if (!container) throw new Error('#main container not found')
createRoot(container).render(<Main />)
