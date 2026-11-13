import { createFixture } from '../src/types'

/**
 * A local function declaration, called from a server-rendered position,
 * returns a memo whose body reads a key only a literal const's prototype
 * has (`R.toString`, a function in JS), so the server render evaluates it.
 * The template reads the function name as an unbound template variable
 * instead (`local-function-call-unbound`); no emitter spells the inherited
 * read, so it is not refused.
 */
export const fixture = createFixture({
  id: 'module-const-inherited-key-function',
  description: 'a local function returning a memo that reads an inherited const key, called at SSR, reads the inherited function',
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
