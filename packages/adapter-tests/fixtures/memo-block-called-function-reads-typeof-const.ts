import { createFixture } from '../src/types'

/**
 * A block memo that calls a function reading a const member applying `typeof`
 * (#3981): `const f = () => o.kind; return f()`. It rendered empty where Hono
 * renders `string`; every template adapter refuses the const (BF101), and
 * `/* @client *\/` defers the read
 * (`memo-block-called-function-reads-typeof-const-client`).
 */
export const fixture = createFixture({
  id: 'memo-block-called-function-reads-typeof-const',
  description: 'A block memo calling a function over a typeof const member renders the type name (#3981)',
  escapes: [{ kind: 'client-directive', fixture: 'memo-block-called-function-reads-typeof-const-client' }],
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
export function MemoBlockCalledFunctionReadsTypeofConst(props: { x: string }) {
  const o = { n: 2, kind: typeof props.x }
  const m = createMemo(() => {
    const f = () => o.kind
    return f()
  })
  return <p>{m()}</p>
}
`,
  props: { x: 'q' },
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->string<!--/--></p>
  `,
})
