import { createFixture } from '../src/types'

/**
 * A memo whose body reads a key only a literal const's prototype has
 * (`R.toString`, a function in JS), read from a server-rendered position.
 * A template holds the literal without a prototype, so a template adapter
 * refuses the read (BF101).
 */
export const fixture = createFixture({
  id: 'module-const-inherited-key-memo',
  description: 'a memo reading an inherited const key, read at SSR, reads the inherited function',
  escapes: [{ kind: 'client-directive', fixture: 'module-const-inherited-key-memo-client' }],
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
export function ModuleConstInheritedKeyMemo() {
  const R = { k: 'v' }
  const m = createMemo(() => (R.toString ? 'y' : 'n'))
  return <p>{m()}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->y<!--/--></p>
  `,
})
