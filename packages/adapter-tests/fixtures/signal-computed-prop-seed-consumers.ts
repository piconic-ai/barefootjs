import { createFixture } from '../src/types'

/**
 * Computed signal seeds read through their consumers: forwarded to a child
 * prop, and as the condition of a ternary memo. Every reader of a signal's
 * seed on Go Template goes through one shared path (#3519), so the child
 * and the memo get the evaluated value the signal's own field holds, not
 * the bare prop.
 */
export const fixture = createFixture({
  id: 'signal-computed-prop-seed-consumers',
  description: 'a computed signal seed reaches a child prop and a ternary memo with its evaluated value (#3519)',
  source: `
'use client'
import { createSignal, createMemo } from '@barefootjs/client'

function Count(props: { value: number }) {
  return <b>{props.value}</b>
}

export function ComputedSeedConsumers(props: { n: number; flag: boolean }) {
  const [count] = createSignal(props.n || 5)
  const [enabled] = createSignal(props.flag || true)
  const label = createMemo(() => enabled() ? 'on' : 'off')
  return (
    <div data-count={count()}>
      <Count value={count()} />
      <span>{label()}</span>
    </div>
  )
}
`,
  props: { n: 0, flag: false },
  expectedHtml: `
    <div bf-s="test" bf="s3" data-count="5">
      <b bf-s="test_s0" bf="s1"><!--bf:s0-->5<!--/--></b>
      <span bf="s2"><!--bf:s1-->on<!--/--></span>
    </div>
  `,
  dataPoints: [
    { name: 'given', props: { n: 3, flag: true } },
  ],
})
