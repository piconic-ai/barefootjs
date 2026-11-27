import { createFixture } from '../src/types'

/**
 * A block memo passing a const member applying `typeof` through two locals,
 * the last shadowing a module const (#3981): `const a = o.kind; const b = a;
 * return b` beside `const b = 'fallback'`. It rendered empty where Hono renders
 * `string`; every template adapter refuses the const (BF101), and
 * `/* @client *\/` defers the read (`memo-block-local-chain-reads-typeof-const-client`).
 */
export const fixture = createFixture({
  id: 'memo-block-local-chain-reads-typeof-const',
  description: 'A block memo passing a typeof const member through locals renders the type name (#3981)',
  escapes: [{ kind: 'client-directive', fixture: 'memo-block-local-chain-reads-typeof-const-client' }],
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
const b = 'fallback'
export function MemoBlockLocalChainReadsTypeofConst(props: { x: string }) {
  const o = { kind: typeof props.x }
  const m = createMemo(() => {
    const a = o.kind
    const b = a
    return b
  })
  return <p>{m()}</p>
}
`,
  props: { x: 'q' },
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->string<!--/--></p>
  `,
})
