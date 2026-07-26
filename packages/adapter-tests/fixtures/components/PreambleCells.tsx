'use client'

// Test fixture (#2389 patch-on-update): a keyed `.map()` row body whose
// preamble builds a JSX leaf from item state (`cells.push(<td>{stateLabel}</td>)`)
// and embeds it directly as a bare interpolation (`{cells}`) alongside an
// ordinary wired text slot (`{t.name}`). Before the fix, `{cells}` had no
// slot wiring at all, so a same-key `toggle()` update (mapArray reuses the
// row via per-item `setItem`) left the state cell frozen at its mount-time
// content forever while the sibling `{t.name}` slot updated normally.
//
// Data carries `&` and `"` so SSR/CSR escaping parity for the region rides
// the same pin (both the region's own array-join value and the row's
// ordinary text slot).

import { createSignal } from '@barefootjs/client'

interface Todo {
  id: number
  name: string
  done: boolean
}

export function PreambleCells() {
  const [todos, setTodos] = createSignal<Todo[]>([
    { id: 1, name: 'a & b', done: false },
    { id: 2, name: 'c "d"', done: false },
  ])

  const toggle = (id: number) =>
    setTodos(todos().map(t => (t.id === id ? { ...t, done: !t.done } : t)))

  return (
    <table>
      <tbody>
        {todos().map((t) => {
          const stateLabel = t.done ? 'done & dusted' : 'open'
          const cells = []
          cells.push(<td className="state">{stateLabel}</td>)
          return (
            <tr key={t.id}>
              {cells}
              <td className="name">{t.name}</td>
              <td>
                <button className="toggle" onClick={() => toggle(t.id)}>toggle</button>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
