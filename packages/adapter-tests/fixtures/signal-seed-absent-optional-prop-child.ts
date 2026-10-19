import { createFixture } from '../src/types'

/**
 * A signal seeded from a `||` between two optional props, forwarded to a
 * child prop typed `string` (#3569 review). Go keeps the signal's own field
 * `interface{}` so it can stay nil, and converts the value forwarded to the
 * child's concrete `string` Input.
 */
export const fixture = createFixture({
  id: 'signal-seed-absent-optional-prop-child',
  description: 'a signal seeded from absent optional props, forwarded to a concrete child prop (#3569)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
import { Child } from './child'

export function SignalSeedAbsentOptionalPropChild(props: { a?: string; b?: string }) {
  const [value] = createSignal(props.a || props.b)
  return <div data-value={value()}><Child value={value()} /></div>
}
`,
  components: {
    './child.tsx': `
export function Child(props: { value: string }) {
  return <p>{props.value}</p>
}
`,
  },
  props: { a: 'A', b: 'B' },
  expectedHtml: `
    <div bf-s="test" bf="s1" data-value="A"><p bf-s="test_s0" bf="s1"><!--bf:s0-->A<!--/--></p></div>
  `,
  dataPoints: [
    { name: 'a-absent', props: { b: 'B' } },
    { name: 'a-empty', props: { a: '', b: 'B' } },
  ],
})
