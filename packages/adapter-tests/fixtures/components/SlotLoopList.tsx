'use client'

import { createSignal } from '@barefootjs/client'

export function SlotLoopList(props: { footer?: any; label: string; flag: boolean }) {
  const [rows, setRows] = createSignal(['a', 'b'])
  return (
    <div className="obj">
      <button className="add-obj" onClick={() => setRows(xs => [...xs, 'c'])}>add</button>
      <ul>
        {rows().map((i) => (
          <li key={i}>
            {i}
            {props.footer}
            <span className="label">{props.label}</span>
            <span className="tern">{props.flag ? props.footer : null}</span>
            <span className="and">{props.flag && props.footer}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
