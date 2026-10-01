import { createFixture } from '../src/types'

export const fixture = createFixture({
  id: 'signal-literal-prop-object-collision',
  description: 'A literal-seeded object signal and same-named prop retain distinct member values',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type Item = { id: number; active: boolean }
export function SignalLiteralPropObjectCollision(props: { item: Item }) {
  const [item] = createSignal<Item>({ id: 7, active: false })
  return <div>
    <span>{props.item.id}</span>
    <span>{item().id}</span>
    <span>{props.item.active ? 'active' : 'inactive'}</span>
    <span>{item().active ? 'active' : 'inactive'}</span>
  </div>
}
`,
  props: { item: { id: 2, active: true } },
  dataPoints: [
    { name: 'zero-inactive-prop', props: { item: { id: 0, active: false } } },
  ],
  expectedHtml: `
    <div bf-s="test">
      <span bf="s1"><!--bf:s0-->2<!--/--></span>
      <span bf="s3"><!--bf:s2-->7<!--/--></span>
      <span bf="s5"><!--bf-cond-start:s4-->active<!--bf-cond-end:s4--></span>
      <span bf="s7"><!--bf-cond-start:s6-->inactive<!--bf-cond-end:s6--></span>
    </div>
  `,
})
