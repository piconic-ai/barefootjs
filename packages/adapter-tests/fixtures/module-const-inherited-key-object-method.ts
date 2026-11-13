import { createFixture } from '../src/types'

/**
 * An arrow-valued property of an object const (`H.get`), called from a
 * server-rendered position, reads a key only a literal const's prototype
 * has.
 * A template holds the literal without a prototype, so a template adapter
 * refuses the read (BF101).
 */
export const fixture = createFixture({
  id: 'module-const-inherited-key-object-method',
  description: 'an object const method reading an inherited const key, called at SSR, reads the inherited function',
  escapes: [{ kind: 'client-directive', fixture: 'module-const-inherited-key-function-client' }],
  source: `
'use client'
export function ModuleConstInheritedKeyObjectMethod() {
  const R = { k: 'v' }
  const H = { get: () => (R.toString ? 'y' : 'n') }
  return <p>{H.get()}</p>
}
`,
  expectedHtml: `
    <p bf-s="test"><!--bf:s0-->y<!--/--></p>
  `,
})
