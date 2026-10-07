import { createFixture } from '../src/types'

/**
 * A memo dividing a number read by an integer literal yields the JavaScript
 * quotient (#3379): a prop member, a signal and a memo-chain dependency, an
 * exact quotient that prints without a fraction, and arithmetic on it across
 * an identity memo, in text and attribute position. Go used to lower the
 * constructor value to integer division.
 */
export const fixture = createFixture({
  id: 'memo-literal-division',
  description: 'A memo dividing a number by an integer literal renders the JavaScript quotient',
  source: `
'use client'
import { createMemo, createSignal } from '@barefootjs/client'
export function MemoLiteralDivision(props: { value: number; even: number }) {
  const [count] = createSignal(1234567890)
  const eighth = createMemo(() => props.value / 8)
  const quarter = createMemo(() => count() / 4)
  const exact = createMemo(() => props.even / 2)
  const next = createMemo(() => eighth() + 1)
  const copy = createMemo(() => eighth())
  const doubled = createMemo(() => copy() * 2)
  return (
    <div data-eighth={eighth()} data-quarter={quarter()}>
      <span>{eighth()}</span>
      <span>{quarter()}</span>
      <span>{exact()}</span>
      <span>{next()}</span>
      <span>{doubled()}</span>
    </div>
  )
}
`,
  props: { value: 1234567890, even: 2469135780 },
  expectedHtml: `
    <div bf-s="test" bf="s10" data-eighth="154320986.25" data-quarter="308641972.5">
      <span bf="s1"><!--bf:s0-->154320986.25<!--/--></span>
      <span bf="s3"><!--bf:s2-->308641972.5<!--/--></span>
      <span bf="s5"><!--bf:s4-->1234567890<!--/--></span>
      <span bf="s7"><!--bf:s6-->154320987.25<!--/--></span>
      <span bf="s9"><!--bf:s8-->308641972.5<!--/--></span>
    </div>
  `,
})
