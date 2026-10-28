'use client'

import { createSignal } from '@barefootjs/client'

type Group = { id: string; items: string[] }

export function SlotLoopNested(props: { footer?: any }) {
  const [groups, setGroups] = createSignal<Group[]>([{ id: 'g1', items: ['a'] }])
  const [on, setOn] = createSignal(true)
  return (
    <div className="nested">
      <button className="add-nested" onClick={() => setGroups(gs => [...gs, { id: 'g2', items: ['b'] }])}>add</button>
      <button className="toggle-nested" onClick={() => setOn(v => !v)}>toggle</button>
      {groups().map((g) => (
        <section key={g.id}>
          {g.items.map((i) => (
            <p key={i}>{i}{props.footer}</p>
          ))}
          {on() ? <em>{props.footer}</em> : <u>off</u>}
        </section>
      ))}
      <ul className="static">
        {['x', 'y'].map((s) => (
          <li key={s}>{s}{props.footer}</li>
        ))}
      </ul>
    </div>
  )
}
