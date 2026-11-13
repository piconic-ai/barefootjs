import { createFixture } from '../src/types'

/**
 * A memo, read from a server-rendered position, calls an arrow-valued
 * property of an object const (`H.get()`) that reads a key only a literal
 * const's prototype has. Calling the method evaluates its body, so the
 * shared pass refuses the read (BF101); the sibling
 * `module-const-inherited-key-object-safe` reads another key of the same
 * shape and compiles.
 */
export const fixture = createFixture({
  id: 'module-const-inherited-key-memo-method',
  description: 'a memo calling an object const method that reads an inherited const key reads the inherited function',
  escapes: [{ kind: 'client-directive', fixture: 'module-const-inherited-key-value-client' }],
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
export function ModuleConstInheritedKeyMemoMethod() {
  const R = { k: 'v' }
  const H = { safe: 'ok', get: () => (R.toString ? 'y' : 'n') }
  const m = createMemo(() => H.get())
  return <p>{m()}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->y<!--/--></p>
  `,
})
