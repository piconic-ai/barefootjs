'use client'

// A destructured prop the component writes in its event handlers is a local
// it owns, as in JS: `start` is read once from the prop, then incremented in
// place. The client used to rewrite every reference to `start` into the live
// prop read `(_p.start ?? 0)`, write positions included, so `++start` became
// `++(_p.start ?? 0)` — a SyntaxError that broke the whole module.
//
// `step` is never written: a handler's own `for (let step …)` shadows it, so
// that loop's `step++` is the loop variable's, and every other `step` read
// stays the live prop read.
import { createSignal } from '@barefootjs/client'

export function ReassignedPropCounter({ start = 0, step = 1 }: { start?: number; step?: number }) {
  const [items, setItems] = createSignal<number[]>([])
  const addPre = () => setItems([...items(), ++start])
  const addStep = () => {
    let laps = 0
    for (let step = 0; step < 2; step++) laps++
    start += step * laps
    setItems([...items(), start])
  }
  return (
    <div>
      <button className="add-pre" onClick={addPre}>pre</button>
      <button className="add-step" onClick={addStep}>step</button>
      <button
        className="add-double"
        onClick={() => {
          start = start * 2
          setItems([...items(), start])
        }}
      >
        double
      </button>
      <p className="start">{start}</p>
      <p className="items">{items().join(',')}</p>
    </div>
  )
}
