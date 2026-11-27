import { createFixture } from '../src/types'

/**
 * A signal seeded with `x ?? 'missing'` over a prop declared `unknown`, read
 * off the props object and through a destructured binding, called without
 * the prop, with a number and with a string. The signal holds what the
 * caller passes, not a value of the fallback's type (#3987).
 */
export const fixture = createFixture({
  id: 'nullish-seed-over-unknown-prop',
  description: 'A ?? seed over an unknown-typed prop holds the passed value whatever its type',
  source: `
import { Member, Binding } from './note'
export function Host() {
  return (
    <div>
      <Member />
      <Member x={42} />
      <Member x="s" />
      <Binding />
      <Binding x={1.5} />
    </div>
  )
}
`,
  components: {
    './note.tsx': `
'use client'
import { createSignal } from '@barefootjs/client'
export function Member(props: { x?: unknown }) {
  const [v] = createSignal(props.x ?? 'missing')
  return <b>{v()}</b>
}
export function Binding({ x }: { x?: unknown }) {
  const [v] = createSignal((x) ?? 'missing')
  return <i>{v()}</i>
}
`,
  },
  expectedHtml: `
    <div bf-s="test">
      <b bf-s="test_s0" bf="s1"><!--bf:s0-->missing<!--/--></b>
      <b bf-s="test_s1" bf="s1"><!--bf:s0-->42<!--/--></b>
      <b bf-s="test_s2" bf="s1"><!--bf:s0-->s<!--/--></b>
      <i bf-s="test_s3" bf="s1"><!--bf:s0-->missing<!--/--></i>
      <i bf-s="test_s4" bf="s1"><!--bf:s0-->1.5<!--/--></i>
    </div>
  `,
})
