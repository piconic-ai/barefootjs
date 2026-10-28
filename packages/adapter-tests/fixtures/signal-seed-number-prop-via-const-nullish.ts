import { createFixture } from '../src/types'

/**
 * A number signal seeded through a component-scope const that reads an
 * optional prop (`const mid = props.b; createSignal((mid ?? 1) * 2)`).
 * When the caller omits `b`, the `??` must take its right side (`2`), not
 * read the absent prop as `0`. The signal is named apart from every prop;
 * `signal-prop-same-name-via-const-derived` is the same-named twin.
 */
export const fixture = createFixture({
  id: 'signal-seed-number-prop-via-const-nullish',
  description: 'A number signal seeded via a const of an optional prop falls back when the prop is omitted',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function SignalSeedNumberPropViaConstNullish(props: { b?: number }) {
  const mid = props.b
  const [count] = createSignal((mid ?? 1) * 2)
  return <span>{count()}</span>
}
`,
  props: {},
  dataPoints: [
    { name: 'passed', props: { b: 5 } },
    { name: 'zero', props: { b: 0 } },
  ],
  expectedHtml: `
    <span bf-s="test" bf="s1"><!--bf:s0-->2<!--/--></span>
  `,
})
