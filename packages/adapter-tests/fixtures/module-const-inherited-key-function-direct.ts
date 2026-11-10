import { createFixture } from '../src/types'

/**
 * A local function declaration, called from a server-rendered position,
 * reads a key only a literal const's prototype has in its own body.
 * A template holds the literal without a prototype, so a template adapter
 * refuses the read (BF101).
 */
export const fixture = createFixture({
  id: 'module-const-inherited-key-function-direct',
  description: 'a local function reading an inherited const key, called at SSR, reads the inherited function',
  escapes: [{ kind: 'client-directive', fixture: 'module-const-inherited-key-function-client' }],
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
