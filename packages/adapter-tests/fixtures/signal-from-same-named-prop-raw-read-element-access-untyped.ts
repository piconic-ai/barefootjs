import { createFixture } from '../src/types'

/**
 * `signal-from-same-named-prop-raw-read-element-access` with an untyped
 * `props` parameter: the literal element-access read is what names the
 * prop the signal is separated from.
 */
export const fixture = createFixture({
  id: 'signal-from-same-named-prop-raw-read-element-access-untyped',
  description: 'A signal seeded from its same-named prop of an untyped props object, read beside the raw prop through a literal element access',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function SignalFromSameNamedPropRawReadElementAccessUntyped(props) {
  const [label] = createSignal(props.label ?? 'D')
  return <p data-l={label()}>{label()}|{props['label']}</p>
}
`,
  props: {},
  dataPoints: [
    { name: 'supplied', props: { label: 'L' } },
  ],
  expectedHtml: `
    <p bf-s="test" bf="s2" data-l="D"><!--bf:s0-->D<!--/-->|<!--bf:s1--><!--/--></p>
  `,
})
