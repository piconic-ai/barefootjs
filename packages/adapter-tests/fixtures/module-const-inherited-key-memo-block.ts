import { createFixture } from '../src/types'

/**
 * A block-bodied memo, read from a server-rendered position, reads a key
 * only a literal const's prototype has (`R.toString`, a function in JS) in
 * one of its statements. No single expression stands for the block, so a
 * template adapter would render the memo's static default (`n`) where JS
 * renders `y`. The shared pass refuses the read (BF101).
 */
export const fixture = createFixture({
  id: 'module-const-inherited-key-memo-block',
  description: 'a block-bodied memo reading an inherited const key in a statement reads the inherited function',
  escapes: [{ kind: 'client-directive', fixture: 'module-const-inherited-key-memo-client' }],
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
export function ModuleConstInheritedKeyMemoBlock() {
  const R = { k: 'v' }
  const m = createMemo(() => {
    const inherited = R.toString
    let x = 'n'
    if (inherited) x = 'y'
    return x
  })
  return <p>{m()}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->y<!--/--></p>
  `,
})
