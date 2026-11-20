import { createFixture } from '../src/types'

/**
 * A memo whose body spreads a defaulted body-destructured prop in place
 * (#3954): `createMemo(() => [...b, 'z'].length)`, no const in between. It
 * rendered empty, or `0` on Go, where Hono renders `2`; every template
 * adapter refuses it (BF101), and `/* @client *\/` defers the read
 * (`destructure-default-spread-memo-body-client`).
 */
export const fixture = createFixture({
  id: 'destructure-default-spread-memo-body',
  description: 'A memo spreading a defaulted destructured array prop in its body renders the length (#3954)',
  escapes: [{ kind: 'client-directive', fixture: 'destructure-default-spread-memo-body-client' }],
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
export function DestructureDefaultSpreadMemoBody(props: { b?: string[] }) {
  const { b = ['y'] } = props
  const n = createMemo(() => [...b, 'z'].length)
  return <p>{n()}</p>
}
`,
  props: {},
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->2<!--/--></p>
  `,
})
