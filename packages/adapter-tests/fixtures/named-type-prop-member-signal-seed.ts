import { createFixture } from '../src/types'

/**
 * Signals seeded from members of a prop typed by a same-file object type
 * referenced BY NAME (`{ initial }: { initial: State }`, with `State` an
 * `interface` and its row type `Item` a `type` alias) — the shape every
 * Explore Sweep scenario uses. The seeded values are read as text (a
 * string and a number member), as a conditional, as a keyed loop source,
 * and forwarded to a child component prop. The server HTML must carry the
 * seeded values exactly as if the members had been passed as top-level
 * props.
 */
export const fixture = createFixture({
  id: 'named-type-prop-member-signal-seed',
  description: 'signals seeded from members of a named-type object prop render their seed at SSR (text, conditional, keyed loop, child prop)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

type Item = { id: string; label: string }

interface State {
  label: string
  count: number
  open: boolean
  items: Item[]
}

function Tag({ label }: { label: string }) {
  return <b>{label}</b>
}

export function NamedTypePropMemberSignalSeed({ initial }: { initial: State }) {
  const [label, setLabel] = createSignal(initial.label)
  const [count, setCount] = createSignal(initial.count)
  const [open, setOpen] = createSignal(initial.open)
  const [items, setItems] = createSignal(initial.items)
  return (
    <div>
      <p>{label()}</p>
      <i>{count()}</i>
      {open() ? <span>on</span> : <span>off</span>}
      <ul>
        {items().map(item => (
          <li key={item.id}>{item.label}</li>
        ))}
      </ul>
      <Tag label={label()} />
      <button onClick={() => { setLabel('b'); setCount(count() + 1); setOpen(!open()); setItems([]) }}>go</button>
    </div>
  )
}
`,
  props: {
    initial: {
      label: 'a',
      count: 3,
      open: true,
      items: [{ id: 'n0', label: 'item 0' }, { id: 'n1', label: 'item 1' }],
    },
  },
  expectedHtml: `
    <div bf-s="test" bf="s9">
      <p bf="s1"><!--bf:s0-->a<!--/--></p>
      <i bf="s3"><!--bf:s2-->3<!--/--></i>
      <span bf-c="s4">on</span>
      <ul bf="s6">
        <li data-key="n0"><!--bf:s5-->item 0<!--/--></li>
        <li data-key="n1"><!--bf:s5-->item 1<!--/--></li>
      </ul>
      <b bf-s="test_s7" bf="s1"><!--bf:s0-->a<!--/--></b>
      <button bf="s8">go</button>
    </div>
  `,
})
