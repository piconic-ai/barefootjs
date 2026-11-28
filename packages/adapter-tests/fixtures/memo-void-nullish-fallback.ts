import { createFixture } from '../src/types'

/**
 * A memo whose body falls back from `void 0` (#3981): `createMemo(() =>
 * (void 0) ?? 'a')`. The DSL adapters render the fallback as Hono does; Go
 * renders the slot empty.
 */
export const fixture = createFixture({
  id: 'memo-void-nullish-fallback',
  description: 'A memo falling back from void 0 renders the fallback',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
export function MemoVoidNullishFallback() {
  const v = createMemo(() => (void 0) ?? 'a')
  return <p>{v()}</p>
}
`,
  props: {},
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->a<!--/--></p>
  `,
})
