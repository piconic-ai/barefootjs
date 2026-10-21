import { createFixture } from '../src/types'

/**
 * The destructured twin of `signal-named-like-prop`. A destructured
 * `label` and a signal `label` cannot coexist in JS, so the prop is
 * renamed in the pattern (`{ label: caption }`); the caller still passes
 * `label`, and the signal `label` is seeded from another prop.
 */
export const fixture = createFixture({
  id: 'signal-named-like-renamed-prop',
  description: 'A signal named like the caller-facing key of a renamed destructured prop',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function SignalNamedLikeRenamedProp({ label: caption, b }: { label?: string; b?: string }) {
  const [label] = createSignal(b ?? 'y')
  return <p data-l={label()}>{label()} / {caption}</p>
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
