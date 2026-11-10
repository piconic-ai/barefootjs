import { createFixture } from '../src/types'

/**
 * A memo calls a local function named like a typed prop whose body is more
 * than one `return`: a template cannot compute the memo, which would render
 * empty where Hono renders the function's `1`, so every template adapter
 * refuses it (BF101).
 */
export const fixture = createFixture({
  id: 'memo-uninlinable-local-function-named-like-prop',
  description: 'A memo calling a local function named like a typed prop that a template cannot inline refuses',
  source: `
'use client'
import { createMemo, createSignal } from '@barefootjs/client'
export function MemoUninlinableLocalFunctionNamedLikeProp(props: { value?: number }) {
  function value() {
    const one = 1
    return one
  }
  const n = createMemo(() => value())
  return <p>{n()}</p>
}
`,
  props: { value: 9 },
  escapes: [{ kind: 'client-directive', fixture: 'memo-uninlinable-local-function-named-like-prop-client' }],
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->1<!--/--></p>
  `,
})
