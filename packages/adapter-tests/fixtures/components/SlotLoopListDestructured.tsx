'use client'

import { createSignal } from '@barefootjs/client'

export function SlotLoopListDestructured({ footer: foot, label }: { footer?: any; label: string }) {
  const [rows, setRows] = createSignal(['a', 'b'])
  const alias = foot
  return (
    <div className="destructured">
      <button className="add-destructured" onClick={() => setRows(xs => [...xs, 'c'])}>add</button>
      <ol>
        {rows().map((item) => (
          <li key={item}>
            <b>{foot}</b>
            <i>{alias}</i>
            <span className="label">{label}</span>
          </li>
        ))}
        {rows().map((label) => (
          <li key={label} className="shadow">{label}</li>
        ))}
      </ol>
    </div>
  )
}
