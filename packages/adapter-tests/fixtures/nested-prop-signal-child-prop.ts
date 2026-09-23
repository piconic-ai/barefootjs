import { createFixture } from '../src/types'

/**
 * A signal seeded from a nested prop member (`createSignal(initial.label)`)
 * and forwarded to a child component's typed prop. The parent renders the
 * value itself and passes the same getter to the child, so the child's
 * SSR text must carry the seed.
 */
export const fixture = createFixture({
  id: 'nested-prop-signal-child-prop',
  description: 'a signal seeded from a nested prop member reaches a child component prop at SSR',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

function Tag({ label }: { label: string }) {
  return <b>{label}</b>
}

export function NestedPropSignalChildProp({ initial }: { initial: { label: string } }) {
  const [label, setLabel] = createSignal(initial.label)
  return (
    <div>
      <Tag label={label()} />
      <button onClick={() => setLabel('b')}>b</button>
    </div>
  )
}
`,
  props: { initial: { label: 'a' } },
  expectedHtml: `
    <div bf-s="test">
      <b bf-s="test_s0" bf="s1"><!--bf:s0-->a<!--/--></b>
      <button bf="s1">b</button>
    </div>
  `,
})
