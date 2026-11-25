import { createFixture } from '../src/types'

/**
 * A member, call or index read on a const whose initializer binds looser
 * than member access (#3965).
 */
export const fixture = createFixture({
  id: 'member-read-on-low-precedence-const',
  description: 'A member / call / index read on a const whose initializer is a conditional, logical or binary expression keeps its grouping (#3965)',
  source: `
export function MemberReadOnLowPrecedenceConst(props: { on?: boolean; a: string; b: string; n: number; m: number }) {
  const pick = props.on ? props.a : props.b
  const either = props.a || props.b
  const sum = props.n + props.m
  return (
    <div>
      <p title={pick.toUpperCase()}>{pick.toUpperCase()}</p>
      <p data-len={either.length}>{either.length}</p>
      <p data-s={sum.toFixed(1)}>{sum.toFixed(1)}</p>
      <p data-c={pick[0]}>{pick[0]}</p>
    </div>
  )
}
`,
  props: { on: false, a: 'ab', b: 'cd', n: 1, m: 2 },
  expectedHtml: `
    <div bf-s="test">
      <p bf="s1" title="CD"><!--bf:s0-->CD<!--/--></p>
      <p bf="s3" data-len="2"><!--bf:s2-->2<!--/--></p>
      <p bf="s5" data-s="3.0"><!--bf:s4-->3.0<!--/--></p>
      <p bf="s7" data-c="c"><!--bf:s6-->c<!--/--></p>
    </div>
  `,
})
