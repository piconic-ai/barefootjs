'use client'
import { createSignal } from '@barefootjs/client'
export function ConditionalNestedPrecomputed(props: { groups: string[]; choices: string[] }) {
  const [open, setOpen] = createSignal(true)
  const [picked, setPicked] = createSignal('a1')

  return <section>
    <button id="toggle" onClick={() => setOpen(!open())}>toggle</button>
    <output>{picked()}</output>
    {open() ? <div>{props.groups.map(group => <div key={group}>
      {props.choices.map(choice => <button key={choice} data-choice={`${group}${choice}`}
        aria-checked={picked() === `${group}${choice}` ? 'true' : 'false'}
        onClick={() => setPicked(`${group}${choice}`)}>
        <span className="status">{picked() === `${group}${choice}` ? 'on' : 'off'}</span>
        <span className="value">{picked() + ':' + `${group}${choice}`}</span>
      </button>)}
    </div>)}</div> : null}
  </section>
}
