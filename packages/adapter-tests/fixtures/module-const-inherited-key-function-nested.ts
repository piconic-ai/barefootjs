import { createFixture } from '../src/types'

/**
 * A local function called from a server-rendered position calls another
 * local function, whose body reads a memo that reads a key only a literal
 * const's prototype has.
 * A template holds the literal without a prototype, so a template adapter
 * refuses the read (BF101).
 */
export const fixture = createFixture({
  id: 'module-const-inherited-key-function-nested',
  description: 'a local function calling another that reads an inherited const key through a memo, called at SSR, reads the inherited function',
  escapes: [{ kind: 'client-directive', fixture: 'module-const-inherited-key-function-client' }],
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
export function ModuleConstInheritedKeyFunctionNested() {
  const R = { k: 'v' }
  const m = createMemo(() => (R.toString ? 'y' : 'n'))
  function inner() {
    return m()
  }
  function outer() {
    return inner() + '!'
  }
  return <p>{outer()}</p>
}
`,
  expectedHtml: `
    <p bf-s="test"><!--bf:s0-->y!<!--/--></p>
  `,
})
