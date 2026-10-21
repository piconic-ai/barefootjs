import { createFixture } from '../src/types'

/**
 * A signal getter whose name differs from a prop's only by the case of
 * its first letter (`Label` vs `props.label`). They are different JS
 * names, but a backend that exports names as struct fields (Go) maps both
 * to the same field `Label`.
 */
export const fixture = createFixture({
  id: 'signal-named-like-prop-case-fold',
  description: 'A signal named like another prop up to case stays apart from the prop',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function SignalNamedLikePropCaseFold(props: { label?: string; b?: string }) {
  const [Label] = createSignal(props.b ?? 'y')
  return <p data-l={Label()}>{Label()} / {props.label}</p>
}
`,
  props: { label: 'P', b: 'B' },
  dataPoints: [
    { name: 'prop-only', props: { label: 'P' } },
    { name: 'seed-only', props: { b: 'B' } },
    { name: 'neither', props: {} },
  ],
  expectedHtml: `
    <p bf-s="test" bf="s2" data-l="B"><!--bf:s0-->B<!--/--> / <!--bf:s1-->P<!--/--></p>
  `,
})
