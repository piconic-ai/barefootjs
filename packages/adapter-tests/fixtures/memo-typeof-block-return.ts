import { createFixture } from '../src/types'

/**
 * A block-bodied memo whose single statement returns `typeof` of a prop
 * (#3981): `createMemo(() => { return typeof props.x })`. It rendered empty
 * (`map[]` on Go) where Hono renders `string`; every template adapter refuses
 * it (BF101), and `/* @client *\/` defers the read
 * (`memo-typeof-block-return-client`).
 */
export const fixture = createFixture({
  id: 'memo-typeof-block-return',
  description: 'A block memo returning typeof of a prop renders the type name (#3981)',
  escapes: [{ kind: 'client-directive', fixture: 'memo-typeof-block-return-client' }],
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
export function MemoTypeofBlockReturn(props: { x: string }) {
  const kind = createMemo(() => {
    return typeof props.x
  })
  return <p>{kind()}</p>
}
`,
  props: { x: 'q' },
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->string<!--/--></p>
  `,
})
