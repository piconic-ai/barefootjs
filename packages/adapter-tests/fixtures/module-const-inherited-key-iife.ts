import { createFixture } from '../src/types'

/**
 * An immediately invoked arrow in a server-rendered position reads a key
 * only a literal const's prototype has.
 * A template holds the literal without a prototype, so a template adapter
 * refuses the read (BF101).
 */
export const fixture = createFixture({
  id: 'module-const-inherited-key-iife',
  description: 'an IIFE in markup reading an inherited const key reads the inherited function',
  escapes: [{ kind: 'client-directive', fixture: 'module-const-inherited-key-function-client' }],
  source: `
'use client'
export function ModuleConstInheritedKeyIife() {
  const R = { k: 'v' }
  return <p>{(() => (R.toString ? 'y' : 'n'))()}</p>
}
`,
  expectedHtml: `
    <p bf-s="test"><!--bf:s0-->y<!--/--></p>
  `,
})
