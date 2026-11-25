import { createFixture } from '../src/types'

/**
 * A server-render seed whose expression reads a member on an operand that
 * binds looser than member access: a conditional, a logical or a binary
 * expression (#3965). The seed reaches the template adapters as printed
 * text, re-read by the static evaluator, so the printer must keep the
 * grouping: printed as `true ? 'abc' : 'de'.length` the read lands on the
 * last arm only. Covers a local helper's body, a memo whose block body
 * folds to a member read on a const's conditional initializer, and a
 * destructure default computed from another prop.
 */
export const fixture = createFixture({
  id: 'signal-seed-local-call-member-on-conditional',
  description: 'A seed that reads a member on a conditional / logical / binary operand keeps the grouping (#3965)',
  source: `
'use client'
import { createSignal, createMemo } from '@barefootjs/client'
export function SignalSeedLocalCallMemberOnConditional({ a = 'q', b = (a || 'zz').length }: { a?: string; b?: number }) {
  const pick = () => (true ? 'abc' : 'de').length
  const either = () => ('x' || 'yz').length
  const sum = () => ('a' + 'b').length
  const [v] = createSignal(pick())
  const [n] = createSignal(either())
  const [s] = createSignal(sum())
  const m = createMemo(() => {
    const t = v() > 0 ? 'abcd' : 'de'
    return t.length
  })
  return <p>{v()} {n()} {s()} {m()} {b}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s5"><!--bf:s0-->3<!--/--><!--bf:s1-->1<!--/--><!--bf:s2-->2<!--/--><!--bf:s3-->4<!--/--><!--bf:s4-->1<!--/--></p>
  `,
})
