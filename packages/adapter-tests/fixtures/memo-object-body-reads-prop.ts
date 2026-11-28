import { createFixture } from '../src/types'

/**
 * A memo returning an object literal that reads a prop: `createMemo(() => ({ k: props.x }))`.
 */
export const fixture = createFixture({
  id: 'memo-object-body-reads-prop',
  description: 'A memo returning an object literal that reads a prop renders the prop',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
export function MemoObjectBodyReadsProp(props: { x: string }) {
  const m = createMemo(() => ({ k: props.x }))
  return <p>{m().k}</p>
}
`,
  props: { x: 'q' },
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->q<!--/--></p>
  `,
})
