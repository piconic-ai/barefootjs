import { createFixture } from '../src/types'

/**
 * A memo reads a plain key of a component-local object const whose literal
 * also holds an arrow-valued property. The arrow is never called at SSR, so
 * it must not make the whole const opaque: the memo renders `ok`.
 */
export const fixture = createFixture({
  id: 'memo-object-const-arrow-sibling-key',
  description: 'a memo reading a plain key of a component-local object const renders it beside an arrow-valued property',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
export function MemoObjectConstArrowSiblingKey() {
  const R = { k: 'v' }
  const H = { safe: 'ok', get: () => (R.toString ? 'y' : 'n') }
  const m = createMemo(() => H.safe)
  return <p>{m()}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->ok<!--/--></p>
  `,
})
