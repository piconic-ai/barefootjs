import { createFixture } from '../src/types'

/**
 * `JSON.stringify` of the `-0` of `remainder-negative-zero`: JS writes
 * `-0` as `0`, on its own and inside an array (`JSON.stringify([-4 % 2, 1])`
 * is `[0,1]`). A backend whose JSON encoder keeps the sign of a float
 * `-0.0` writes `-0` (or `-0.0`). The other string conversions are
 * `remainder-negative-zero-string`.
 */
export const fixture = createFixture({
  id: 'remainder-negative-zero-json',
  description: 'JSON.stringify writes the -0 remainder of a negative dividend as 0 (JSON.stringify(-4 % 2))',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function RemainderNegativeZeroJson(props: { n: number }) {
  const [x] = createSignal(-4)
  return (
    <p data-json={JSON.stringify(props.n % 2)}>
      <span>{JSON.stringify(x() % 2)}</span>
      <span>{JSON.stringify([x() % 2, 1])}</span>
    </p>
  )
}
`,
  props: { n: -4 },
  expectedHtml: `
    <p bf-s="test" bf="s4" data-json="0">
      <span bf="s1"><!--bf:s0-->0<!--/--></span>
      <span bf="s3"><!--bf:s2-->[0,1]<!--/--></span>
    </p>
  `,
})
