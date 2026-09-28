import { createFixture } from '../src/types'

/**
 * A signal seeded from an expression that READS a member of a required
 * object-typed prop rather than being the member itself
 * (`createSignal(initial.count + 1)`), rendered as text. The server HTML
 * must carry the computed seed.
 */
export const fixture = createFixture({
  id: 'embedded-prop-member-signal-seed',
  description: 'a signal seeded from an expression over an object prop member renders the computed seed at SSR',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

interface State {
  count: number
}

export function EmbeddedPropMemberSignalSeed({ initial }: { initial: State }) {
  const [count, setCount] = createSignal(initial.count + 1)
  return (
    <div>
      <p>{count()}</p>
      <button onClick={() => setCount(count() + 1)}>+</button>
    </div>
  )
}
`,
  props: { initial: { count: 2 } },
  expectedHtml: `
    <div bf-s="test">
      <p bf="s1"><!--bf:s0-->3<!--/--></p>
      <button bf="s2">+</button>
    </div>
  `,
})
