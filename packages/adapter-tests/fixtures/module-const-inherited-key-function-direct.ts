import { createFixture } from '../src/types'

/**
 * A local function declaration, called from a server-rendered position,
 * reads a key only a literal const's prototype has in its own body.
 * The template reads the function name as an unbound template variable
 * instead (`local-function-call-unbound`); no emitter spells the inherited
 * read, so it is not refused.
 */
export const fixture = createFixture({
  id: 'module-const-inherited-key-function-direct',
  description: 'a local function reading an inherited const key, called at SSR, reads the inherited function',
  source: `
'use client'
export function ModuleConstInheritedKeyFunctionDirect() {
  const R = { k: 'v' }
  function value() {
    return R.toString ? 'y' : 'n'
  }
  return <p>{value()}</p>
}
`,
  expectedHtml: `
    <p bf-s="test"><!--bf:s0-->y<!--/--></p>
  `,
})
