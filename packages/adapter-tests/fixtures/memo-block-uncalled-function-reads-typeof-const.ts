import { createFixture } from '../src/types'

/**
 * A block memo that creates a function reading a const member applying
 * `typeof`, and never calls it (#3981): `const unused = () => o.kind; return
 * false`. The memo's value is computed without reading `o`, and `{o.n}` inlines
 * the member it reads, so every adapter renders `no2` as Hono does; the refusal
 * of an operator no template lowers passes it.
 */
export const fixture = createFixture({
  id: 'memo-block-uncalled-function-reads-typeof-const',
  description: 'A block memo storing an uncalled function over a typeof const member renders its value (#3981)',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
export function MemoBlockUncalledFunctionReadsTypeofConst(props: { x: string }) {
  const o = { n: 2, kind: typeof props.x }
  const m = createMemo(() => {
    const unused = () => o.kind
    return false
  })
  return <p>{m() ? 'yes' : 'no'}{o.n}</p>
}
`,
  props: { x: 'q' },
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf-cond-start:s0-->no<!--bf-cond-end:s0--><!--bf:s1-->2<!--/--></p>
  `,
})
