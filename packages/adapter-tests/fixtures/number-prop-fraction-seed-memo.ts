import { createFixture } from '../src/types'

/**
 * A `number` prop given a fraction seeds a signal through an integer
 * `?? 2` fallback, and a memo multiplies the signal. JS numbers are
 * doubles, so `1.5` stays `1.5` and the memo is `4.5`. An engine that
 * types the value from the integral fallback literal truncates both
 * (`1`, `3`). `number-prop-integral-seed-memo` is the same component
 * with an integer caller value.
 */
export const fixture = createFixture({
  id: 'number-prop-fraction-seed-memo',
  description: 'A fractional number prop seeds a signal through `?? 2` and a memo derived from it (1.5 → 1.5, 4.5)',
  source: `
'use client'
import { createSignal, createMemo } from '@barefootjs/client'
export function NumberPropFractionSeedMemo(props: { b?: number }) {
  const [v] = createSignal(props.b ?? 2)
  const tripled = createMemo(() => v() * 3)
  return (
    <p data-v={v()} data-t={tripled()}>
      <span>{v()}</span>
      <span>{tripled()}</span>
    </p>
  )
}
`,
  props: { b: 1.5 },
  expectedHtml: `
    <p bf-s="test" bf="s4" data-t="4.5" data-v="1.5">
      <span bf="s1"><!--bf:s0-->1.5<!--/--></span>
      <span bf="s3"><!--bf:s2-->4.5<!--/--></span>
    </p>
  `,
})
