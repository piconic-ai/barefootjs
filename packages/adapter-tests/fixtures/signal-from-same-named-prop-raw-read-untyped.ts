import { createFixture } from '../src/types'

/**
 * `signal-from-same-named-prop-raw-read` with an untyped `props`
 * parameter. No props type declares `label`, so the `props.label` reads
 * themselves name the prop the signal is separated from.
 */
export const fixture = createFixture({
  id: 'signal-from-same-named-prop-raw-read-untyped',
  description: 'A signal seeded from its same-named prop of an untyped props object, read beside the raw prop',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function SignalFromSameNamedPropRawReadUntyped(props) {
  const [label] = createSignal(props.label ?? 'D')
  return <p data-l={label()}>{label()} / {props.label}</p>
}
`,
  props: {},
  dataPoints: [
    { name: 'caller', props: { label: 'P' } },
  ],
  expectedHtml: `
    <p bf-s="test" bf="s2" data-l="D"><!--bf:s0-->D<!--/--> / <!--bf:s1--><!--/--></p>
  `,
})
