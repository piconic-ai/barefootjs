import { createFixture } from '../src/types'

/**
 * A memo whose body reads a key only a literal const's prototype has, read
 * from a `/* @client *\/` position and from a server-rendered one: the
 * server-rendered read still needs the memo at SSR.
 * A template holds the literal without a prototype, so a template adapter
 * refuses the read (BF101).
 */
export const fixture = createFixture({
  id: 'module-const-inherited-key-memo-mixed',
  description: 'a memo reading an inherited const key, read at SSR and from /* @client */, reads the inherited function',
  escapes: [{ kind: 'client-directive', fixture: 'module-const-inherited-key-memo-client' }],
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
export function ModuleConstInheritedKeyMemoMixed() {
  const R = { k: 'v' }
  const m = createMemo(() => (R.toString ? 'y' : 'n'))
  return (
    <p>
      {m()}|{/* @client */ m()}
    </p>
  )
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf:s0-->y<!--/-->|<!--bf:s1--><!--/--></p>
  `,
})
