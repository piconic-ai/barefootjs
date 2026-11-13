import { createFixture } from '../src/types'

/**
 * A memo of a memo: `m2` reads `m`, whose body reads a key only a literal
 * const's prototype has; only `m2` is read, from a server-rendered position,
 * so the server render evaluates `m` too.
 * A template holds the literal without a prototype, so a template adapter
 * refuses the read (BF101).
 */
export const fixture = createFixture({
  id: 'module-const-inherited-key-memo-chain',
  description: 'a memo reading an inherited const key, reached through another memo at SSR, reads the inherited function',
  escapes: [{ kind: 'client-directive', fixture: 'module-const-inherited-key-memo-client' }],
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
export function ModuleConstInheritedKeyMemoChain() {
  const R = { k: 'v' }
  const m = createMemo(() => (R.toString ? 'y' : 'n'))
  const m2 = createMemo(() => m() + '!')
  return <p>{m2()}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->y!<!--/--></p>
  `,
})
