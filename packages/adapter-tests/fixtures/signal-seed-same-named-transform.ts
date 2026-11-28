import { createFixture } from '../src/types'

/**
 * A signal seeded by transforming the prop it shares a name with
 * (`createSignal(String(props.seed ?? 'none') + '!')`), forwarded the way
 * a caller hands it in (`<Kid seed="a" />`, `<Kid />`). The child's signal
 * renders the transformed value, never the raw prop and never empty when
 * the prop is absent.
 */
export const fixture = createFixture({
  id: 'signal-seed-same-named-transform',
  description: 'A signal seeded by transforming its same-named prop keeps the transformation',
  source: `
'use client'
import { Kid } from './kid'
export function SignalSeedSameNamedTransform() {
  return <div><Kid seed="a" /><Kid /></div>
}
`,
  components: {
    './kid.tsx': `
'use client'
import { createSignal } from '@barefootjs/client'
export function Kid(props: { seed?: string }) {
  const [seed] = createSignal(String(props.seed ?? 'none') + '!')
  return <p data-seed={seed()}>{seed()}</p>
}
`,
  },
  props: {},
  expectedHtml: `
    <div bf-s="test">
      <p bf-s="test_s0" bf="s1" data-seed="a!"><!--bf:s0-->a!<!--/--></p>
      <p bf-s="test_s1" bf="s1" data-seed="none!"><!--bf:s0-->none!<!--/--></p>
    </div>
  `,
})
