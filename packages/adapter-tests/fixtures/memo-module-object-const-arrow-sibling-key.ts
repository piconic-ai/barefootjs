import { createFixture } from '../src/types'

/**
 * Module-scope variant of `memo-object-const-arrow-sibling-key`: the object
 * const and the const its arrow property reads both live at module scope.
 * A memo reading the plain key `H.safe` renders `ok`.
 */
export const fixture = createFixture({
  id: 'memo-module-object-const-arrow-sibling-key',
  description: 'a memo reading a plain key of a module-level object const renders it beside an arrow-valued property',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
const R = { k: 'v' }
const H = { safe: 'ok', get: () => (R.toString ? 'y' : 'n') }
export function MemoModuleObjectConstArrowSiblingKey() {
  const m = createMemo(() => H.safe)
  return <p>{m()}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->ok<!--/--></p>
  `,
})
