import { createFixture } from '../src/types'

/**
 * A child prop reading a memo that applies `typeof` (#3981):
 * `<Kid v={kind()} />`. The child rendered `null`, `undefined` or empty where
 * Hono renders `string`; every template adapter refuses the memo (BF101). A
 * component renders on the server whatever directive its prop carries, so
 * there is no `/* @client *\/` escape.
 */
export const fixture = createFixture({
  id: 'memo-typeof-child-prop',
  description: 'A child prop reading a memo that applies typeof renders the type name (#3981)',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
function Kid(props: { v: unknown }) {
  return <i>{String(props.v)}</i>
}

export function MemoTypeofChildProp(props: { x: string }) {
  const kind = createMemo(() => typeof props.x)
  return <div><Kid v={kind()} /></div>
}
`,
  props: { x: 'q' },
  expectedHtml: `
    <div bf-s="test"><i bf-s="test_s0" bf="s1"><!--bf:s0-->string<!--/--></i></div>
  `,
})
