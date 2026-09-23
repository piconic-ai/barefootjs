import { createFixture } from '../src/types'

/**
 * Signals seeded from members of an object-typed prop
 * (`createSignal(initial.label)`), read by the component itself as text,
 * as a conditional, and as a keyed loop source. The server HTML must
 * carry the seeded values, exactly as if the prop members had been
 * passed as top-level props.
 */
export const fixture = createFixture({
  id: 'nested-prop-member-signal-seed',
  description: 'signals seeded from nested prop members render their seed at SSR (text, conditional, keyed loop)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

type Item = { id: string; label: string }

export function NestedPropMemberSignalSeed({ initial }: { initial: { label: string; open: boolean; items: Item[] } }) {
  const [label, setLabel] = createSignal(initial.label)
  const [open, setOpen] = createSignal(initial.open)
  const [items, setItems] = createSignal(initial.items)
  return (
    <div>
      <p>{label()}</p>
      {open() ? <span>on</span> : <span>off</span>}
      <ul>
        {items().map(item => (
          <li key={item.id}>{item.label}</li>
        ))}
      </ul>
      <button onClick={() => { setLabel('b'); setOpen(!open()); setItems([]) }}>go</button>
    </div>
  )
}
`,
  props: { initial: { label: 'a', open: true, items: [{ id: 'n0', label: 'item 0' }] } },
  expectedHtml: `
    <div bf-s="test" bf="s6">
      <p bf="s1"><!--bf:s0-->a<!--/--></p>
      <span bf-c="s2">on</span>
      <ul bf="s4"><li data-key="n0"><!--bf:s3-->item 0<!--/--></li></ul>
      <button bf="s5">go</button>
    </div>
  `,
})
