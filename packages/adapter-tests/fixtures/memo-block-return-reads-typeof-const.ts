import { createFixture } from '../src/types'

/**
 * A block-bodied memo returning an object literal that reads a const member
 * applying `typeof` (#3981): `createMemo(() => { return { n: o.n } })`. The
 * memo is
 * computed apart from any emitter, from the whole const, so it rendered empty (Go
 * failed on a nil pointer) where Hono renders `string`; every template adapter
 * refuses the const (BF101), and `/* @client *\/` defers the read
 * (`memo-block-return-reads-typeof-const-client`).
 */
export const fixture = createFixture({
  id: 'memo-block-return-reads-typeof-const',
  description: 'A memo reading a const member that applies typeof renders the type name (#3981)',
  escapes: [{ kind: 'client-directive', fixture: 'memo-block-return-reads-typeof-const-client' }],
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
export function MemoBlockReturnReadsTypeofConst(props: { x: string }) {
  const o = { n: typeof props.x }
  const m = createMemo(() => {
    return { n: o.n }
  })
  return <p>{m().n}</p>
}
`,
  props: { x: 'q' },
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->string<!--/--></p>
  `,
})
