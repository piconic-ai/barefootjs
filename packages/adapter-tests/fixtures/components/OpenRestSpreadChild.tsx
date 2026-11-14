'use client'

// Test fixture (#3714): an open-type `...rest` bag spread onto a child
// component. The rest object holds the caller's props without the key the
// component destructured (`title`), so that key never reaches a child
// through the spread, the spread merges with the call's explicit props in
// source order, and a caller prop the bag carries (`tone`) stays live after
// mount. The same holds in a conditional branch and in a loop row.

import { createSignal } from '@barefootjs/client'

function Chip(props: { title?: string; tone?: string; size?: string }) {
  const [on, setOn] = createSignal(false)
  return (
    <button data-tone={props.tone} data-size={props.size} onClick={() => setOn(!on())}>
      {props.title ?? 'none'}{on() ? '!' : ''}
    </button>
  )
}

type CardProps = { title?: string; items: string[]; tone?: string; size?: string; [key: string]: unknown }

function Card({ title, items, ...rest }: CardProps) {
  return (
    <section data-own={title}>
      <p className="plain"><Chip {...rest} /></p>
      <p className="before"><Chip title="x" tone="first" {...rest} /></p>
      <p className="after"><Chip {...rest} size="last" /></p>
      <p className="branch">{title ? <Chip {...rest} /> : null}</p>
      <ul>{items.map(it => <li key={it}><Chip title={it} {...rest} /></li>)}</ul>
    </section>
  )
}

export function OpenRestSpreadChild() {
  const [tone, setTone] = createSignal('warm')
  return (
    <div>
      <Card title="T" items={['a', 'b']} tone={tone()} size="l" />
      <button className="next" onClick={() => setTone('cool')}>next</button>
    </div>
  )
}
