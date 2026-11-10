import { createFixture } from '../src/types'

/**
 * Escape twin for the memo-indirected `module-const-inherited-key-memo*`
 * fixtures: memos whose bodies read a key only a literal const's prototype
 * has (a memo, and a memo of that memo), read only from `/* @client *\/`
 * positions. The server render never evaluates them, so the component
 * compiles on every template adapter and the reads run in the browser.
 */
export const fixture = createFixture({
  id: 'module-const-inherited-key-memo-client',
  description: 'memos reading an inherited const key, read only from /* @client */ positions, defer to the browser',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
export function ModuleConstInheritedKeyMemoClient() {
  const R = { k: 'v' }
  const m = createMemo(() => (R.toString ? 'y' : 'n'))
  const m2 = createMemo(() => m() + '!')
  return (
    <p>
      {/* @client */ m()}|{/* @client */ m2()}
    </p>
  )
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf:s0--><!--/-->|<!--bf:s1--><!--/--></p>
  `,
})
