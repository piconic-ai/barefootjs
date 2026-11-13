import { createFixture } from '../src/types'

/**
 * A local function declaration, called from a server-rendered position,
 * returns a memo whose body reads a key only a literal const's prototype
 * has (`R.toString`, a function in JS), so the server render evaluates it.
 * A template holds the literal without a prototype, so a template adapter
 * refuses the read (BF101).
 */
export const fixture = createFixture({
  id: 'module-const-inherited-key-function',
  description: 'a local function returning a memo that reads an inherited const key, called at SSR, reads the inherited function',
  escapes: [{ kind: 'client-directive', fixture: 'module-const-inherited-key-function-client' }],
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
export function ModuleConstInheritedKeyFunction() {
  const R = { k: 'v' }
  const m = createMemo(() => (R.toString ? 'y' : 'n'))
  function value() {
    return m()
  }
  return <p>{value()}</p>
}
`,
  expectedHtml: `
    <p bf-s="test"><!--bf:s0-->y<!--/--></p>
  `,
})
