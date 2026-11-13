import { createFixture } from '../src/types'

/**
 * A memo, read from a server-rendered position, returns a component const
 * whose initializer reads a key only a literal const's prototype has
 * (`R.toString`, a function in JS). The memo's server value is computed
 * apart from the position, so the shared pass refuses the read (BF101).
 */
export const fixture = createFixture({
  id: 'module-const-inherited-key-memo-const',
  description: 'a memo returning a const initialized from an inherited const key read reads the inherited function',
  escapes: [{ kind: 'client-directive', fixture: 'module-const-inherited-key-value-client' }],
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
export function ModuleConstInheritedKeyMemoConst() {
  const R = { k: 'v' }
  const c = R.toString ? 'y' : 'n'
  const m = createMemo(() => c)
  return <p>{m()}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->y<!--/--></p>
  `,
})
