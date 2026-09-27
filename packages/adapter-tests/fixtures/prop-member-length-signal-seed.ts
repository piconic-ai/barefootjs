import { createFixture } from '../src/types'

/**
 * A signal seeded from a member chain that continues past an array member
 * of an object-typed prop (`createSignal(initial.items.length)`), rendered
 * as text. The server HTML must carry the array's length.
 */
export const fixture = createFixture({
  id: 'prop-member-length-signal-seed',
  description: 'a signal seeded from `.length` of an array member of an object prop renders its seed at SSR',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

type Item = { id: string }

interface State {
  items: Item[]
}

export function PropMemberLengthSignalSeed({ initial }: { initial: State }) {
  const [count, setCount] = createSignal(initial.items.length)
  return (
    <div>
      <p>{count()}</p>
      <button onClick={() => setCount(count() + 1)}>+</button>
    </div>
  )
}
`,
  props: { initial: { items: [{ id: 'a' }, { id: 'b' }] } },
  expectedHtml: `
    <div bf-s="test">
      <p bf="s1"><!--bf:s0-->2<!--/--></p>
      <button bf="s2">+</button>
    </div>
  `,
})
