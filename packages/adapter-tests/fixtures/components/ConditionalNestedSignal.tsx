'use client'
import { createSignal } from '@barefootjs/client'
const GROUPS = ['a', 'b']
const CHOICES = ['1', '2']
export function ConditionalNestedSignal() {
  const [open, setOpen] = createSignal(true)
  const [picked, setPicked] = createSignal('a1')
  const [groups] = createSignal(GROUPS)
  return <section>
    <button id="toggle" onClick={() => setOpen(!open())}>toggle</button>
    <output>{picked()}</output>
    {open() ? <div>{groups().map(group => <div key={group}>
      {CHOICES.map(choice => <button key={choice} data-choice={group + choice}
        aria-checked={picked() === group + choice ? 'true' : 'false'}
        onClick={() => setPicked(group + choice)}>
        <span className="status">{picked() === group + choice ? 'on' : 'off'}</span>
        <span className="value">{picked() + ':' + group + choice}</span>
      </button>)}
    </div>)}</div> : null}
  </section>
}
