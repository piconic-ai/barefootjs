import { createFixture } from '../src/types'

/**
 * A signal seeded from a member of an OPTIONAL object-typed prop
 * (`{ initial }: { initial?: State }`,
 * `createSignal(initial?.label ?? 'none')`), rendered as text. The server
 * HTML must carry the member the caller passed, or the fallback when the
 * prop is absent (the generated `gen:initial:absent` data point).
 */
export const fixture = createFixture({
  id: 'optional-object-prop-member-signal-seed',
  description: 'a signal seeded from a member of an optional object prop renders its seed (or the fallback) at SSR',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

interface State {
  label: string
}

export function OptionalObjectPropMemberSignalSeed({ initial }: { initial?: State }) {
  const [label, setLabel] = createSignal(initial?.label ?? 'none')
  return (
    <div>
      <p>{label()}</p>
      <button onClick={() => setLabel('b')}>b</button>
    </div>
  )
}
`,
  props: { initial: { label: 'a' } },
  expectedHtml: `
    <div bf-s="test">
      <p bf="s1"><!--bf:s0-->a<!--/--></p>
      <button bf="s2">b</button>
    </div>
  `,
})
