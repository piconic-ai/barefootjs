import { createFixture } from '../src/types'

/**
 * A signal getter named like a prop of a bare-props component, seeded from
 * a DIFFERENT prop: `label()` is the signal, `props.label` is the caller's
 * prop. The template-stash backends flatten `props.label` to a bare
 * `label` variable, so the two must not share it; the analyzer renames the
 * signal binding before IR is built (`separateSignalPropBindings`).
 * A signal seeded from its own same-named prop is
 * `signal-from-same-named-prop-raw-read`.
 */
export const fixture = createFixture({
  id: 'signal-named-like-prop',
  description: 'A signal getter named like another prop reads the signal, not the prop',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function SignalNamedLikeProp(props: { label?: string; b?: string }) {
  const [label] = createSignal(props.b ?? 'y')
  return <p data-l={label()}>{label()} / {props.label}</p>
}
`,
  props: { label: 'P', b: 'B' },
  dataPoints: [
    { name: 'prop-only', props: { label: 'P' } },
    { name: 'seed-only', props: { b: 'B' } },
    { name: 'neither', props: {} },
    { name: 'empty-strings', props: { label: '', b: '' } },
  ],
  expectedHtml: `
    <p bf-s="test" bf="s2" data-l="B"><!--bf:s0-->B<!--/--> / <!--bf:s1-->P<!--/--></p>
  `,
})
