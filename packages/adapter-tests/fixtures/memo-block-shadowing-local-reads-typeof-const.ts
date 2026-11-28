import { createFixture } from '../src/types'

/**
 * A block memo whose local, initialized from a const member applying `typeof`,
 * shadows a module const of the same name (#3981): `const label = o.kind;
 * return label` beside `const label = 'fallback'`. The static evaluator used to
 * read the module `label` for the unresolved local and report `fallback`, so the
 * refusal took the memo's value as computed; it rendered empty (`map[]` on Go)
 * where Hono renders `string`. Every template adapter refuses the const
 * (BF101), and `/* @client *\/` defers the read
 * (`memo-block-shadowing-local-reads-typeof-const-client`).
 */
export const fixture = createFixture({
  id: 'memo-block-shadowing-local-reads-typeof-const',
  description: 'A block memo whose shadowing local reads a typeof const member renders the type name (#3981)',
  escapes: [{ kind: 'client-directive', fixture: 'memo-block-shadowing-local-reads-typeof-const-client' }],
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
const label = 'fallback'
export function MemoBlockShadowingLocalReadsTypeofConst(props: { x: string }) {
  const o = { kind: typeof props.x }
  const m = createMemo(() => {
    const label = o.kind
    const unused = () => false
    return label
  })
  return <p>{m()}</p>
}
`,
  props: { x: 'q' },
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->string<!--/--></p>
  `,
})
