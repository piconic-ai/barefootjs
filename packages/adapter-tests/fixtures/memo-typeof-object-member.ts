import { createFixture } from '../src/types'

/**
 * A memo returning an object literal with a `typeof` member, read through that
 * member (#3981): `createMemo(() => ({ kind: typeof props.x }))`, `k().kind`.
 * The memo is computed whole or not at all, so it rendered empty where Hono
 * renders `string`; every template adapter refuses it (BF101), and
 * `/* @client *\/` defers the read (`memo-typeof-object-member-client`).
 */
export const fixture = createFixture({
  id: 'memo-typeof-object-member',
  description: 'A memo returning an object with a typeof member renders the member (#3981)',
  escapes: [{ kind: 'client-directive', fixture: 'memo-typeof-object-member-client' }],
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
export function MemoTypeofObjectMember(props: { x: string }) {
  const info = createMemo(() => ({ kind: typeof props.x }))
  return <p>{info().kind}</p>
}
`,
  props: { x: 'q' },
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->string<!--/--></p>
  `,
})
