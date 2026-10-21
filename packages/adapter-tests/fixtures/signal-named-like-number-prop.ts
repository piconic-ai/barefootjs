import { createFixture } from '../src/types'

/**
 * The number twin of `signal-named-like-prop`, with a setter: the signal
 * `count` is seeded from `props.b`, and `props.count` is a different value.
 */
export const fixture = createFixture({
  id: 'signal-named-like-number-prop',
  description: 'A number signal named like another prop reads the signal, not the prop',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function SignalNamedLikeNumberProp(props: { count?: number; b?: number }) {
  const [count, setCount] = createSignal(props.b ?? 0)
  return <button onClick={() => setCount(count() + 1)} data-c={count()}>{count()} / {props.count}</button>
}
`,
  props: { count: 5, b: 2 },
  dataPoints: [
    { name: 'prop-only', props: { count: 5 } },
    { name: 'zero', props: { count: 0, b: 0 } },
    { name: 'fraction-prop', props: { count: 0.5 } },
    { name: 'neither', props: {} },
  ],
  expectedHtml: `
    <button bf-s="test" bf="s2" data-c="2"><!--bf:s0-->2<!--/--> / <!--bf:s1-->5<!--/--></button>
  `,
})
