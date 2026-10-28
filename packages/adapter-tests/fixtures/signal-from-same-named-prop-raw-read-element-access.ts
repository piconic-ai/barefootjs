import { createFixture } from '../src/types'

/**
 * `signal-from-same-named-prop-raw-read` with the raw prop read through a
 * literal element access: a string key (`props['label']`) and an optional
 * one (`props?.['note']`). Each raw read must keep the caller's value
 * (empty when omitted), apart from the signal seeded from it. A
 * no-substitution template key (`` props[`title`] ``) separates the same
 * way (analyzer unit test); its lowering on its own is covered by
 * `props-template-literal-key-read`.
 */
export const fixture = createFixture({
  id: 'signal-from-same-named-prop-raw-read-element-access',
  description: 'A signal seeded from its same-named prop, read beside the raw prop through a literal element access',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function SignalFromSameNamedPropRawReadElementAccess(props: { label?: string; note?: string }) {
  const [label] = createSignal(props.label ?? 'D')
  const [note] = createSignal(props.note ?? 'N')
  return (
    <p data-l={label()}>
      {label()}|{props['label']}|{note()}|{props?.['note']}
    </p>
  )
}
`,
  props: {},
  dataPoints: [
    { name: 'supplied', props: { label: 'L', note: 'M' } },
  ],
  expectedHtml: `
    <p bf-s="test" bf="s4" data-l="D"><!--bf:s0-->D<!--/-->|<!--bf:s1--><!--/-->|<!--bf:s2-->N<!--/-->|<!--bf:s3--><!--/--></p>
  `,
})
