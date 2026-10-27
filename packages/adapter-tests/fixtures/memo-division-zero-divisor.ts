import { createFixture } from '../src/types'

/**
 * A memo dividing by zero is IEEE division (#3692): a signal and a prop
 * over the literal `0` (`-Infinity`, `Infinity`, and `NaN` for a zero
 * dividend), an identity memo and arithmetic over that quotient, and a
 * divisor that is a prop which happens to be `0`, in text and attribute
 * position. The literal-divisor memos are the `/ N` shapes of
 * `memo-literal-division` with `N` zero. Go used to give `0` for a zero
 * divisor, and did not build the literal-zero memos.
 */
export const fixture = createFixture({
  id: 'memo-division-zero-divisor',
  description: 'A memo dividing by a literal or runtime zero renders Infinity, -Infinity or NaN',
  source: `
'use client'
import { createMemo, createSignal } from '@barefootjs/client'
export function MemoDivisionZeroDivisor(props: { n: number; zero: number }) {
  const [count] = createSignal(-3)
  const negative = createMemo(() => count() / 0)
  const positive = createMemo(() => props.n / 0)
  const nan = createMemo(() => props.zero / 0)
  const copy = createMemo(() => negative())
  const doubled = createMemo(() => negative() * 2)
  const runtime = createMemo(() => count() / props.zero)
  return (
    <div data-negative={negative()} data-positive={positive()}>
      <span>{negative()}</span>
      <span>{positive()}</span>
      <span>{nan()}</span>
      <span>{copy()}</span>
      <span>{doubled()}</span>
      <span>{runtime()}</span>
    </div>
  )
}
`,
  props: { n: 2, zero: 0 },
  expectedHtml: `
    <div bf-s="test" bf="s12" data-negative="-Infinity" data-positive="Infinity">
      <span bf="s1"><!--bf:s0-->-Infinity<!--/--></span>
      <span bf="s3"><!--bf:s2-->Infinity<!--/--></span>
      <span bf="s5"><!--bf:s4-->NaN<!--/--></span>
      <span bf="s7"><!--bf:s6-->-Infinity<!--/--></span>
      <span bf="s9"><!--bf:s8-->-Infinity<!--/--></span>
      <span bf="s11"><!--bf:s10-->-Infinity<!--/--></span>
    </div>
  `,
})
