'use client'

// DOM-state carrier fixture (#2481): native <select> whose options come
// from a .map() loop, with a signal-controlled value. Exercises the
// `selectedIndex` IDL property the oracle harness's dom-state.ts vocabulary
// tracks — the shared-component corpus had no native <select> fixture
// before this, only the custom Radix-style listbox (`select-demo.tsx`).

import { createSignal } from '@barefootjs/client'

interface Fruit {
  id: string
  label: string
}

export function SelectNative() {
  const [fruits] = createSignal<Fruit[]>([
    { id: 'apple', label: 'Apple' },
    { id: 'banana', label: 'Banana' },
    { id: 'cherry', label: 'Cherry' },
  ])
  const [picked, setPicked] = createSignal('banana')

  return (
    <div className="select-native-demo">
      <select className="fruit-select" value={picked()} onChange={(e) => setPicked(e.target.value)}>
        {fruits().map((f, i) => (
          <option key={i} value={f.id}>
            {f.label}
          </option>
        ))}
      </select>
      <p className="picked-value">Picked: {picked()}</p>
    </div>
  )
}
