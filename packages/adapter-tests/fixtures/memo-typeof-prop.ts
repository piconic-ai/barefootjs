import { createFixture } from '../src/types'

/**
 * A memo whose body applies `typeof` to a prop (#3981):
 * `createMemo(() => typeof props.x)`. No template lowers `typeof`, so it
 * rendered empty, or `0` on Go, where Hono renders the computed value; every
 * template adapter refuses it (BF101), and `/* @client *\/` defers the read
 * (`memo-typeof-prop-client`).
 */
export const fixture = createFixture({
  id: 'memo-typeof-prop',
  description: 'A memo applying typeof to a prop renders the type name (#3981)',
  escapes: [{ kind: 'client-directive', fixture: 'memo-typeof-prop-client' }],
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
export function MemoTypeofProp(props: { x: string }) {
  const kind = createMemo(() => typeof props.x)
  return <p>{kind()}</p>
}
`,
  props: { x: 'q' },
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->string<!--/--></p>
  `,
})
