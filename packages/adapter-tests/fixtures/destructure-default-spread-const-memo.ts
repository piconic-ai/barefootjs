import { createFixture } from '../src/types'

/**
 * A memo over a const spreading a defaulted body-destructured prop (#3954):
 * `const local = [...b, 'z']; createMemo(() => local.length)`. No template
 * computes the memo (the spread has no lowering, and the static evaluator has
 * no value for it), so it rendered empty, or `0` on Go, where Hono renders
 * `2`. Every template adapter refuses it (BF101); `/* @client *\/` defers the
 * read (`destructure-default-spread-const-memo-client`).
 */
export const fixture = createFixture({
  id: 'destructure-default-spread-const-memo',
  description: 'A memo over a const spreading a defaulted destructured array prop renders its length (#3954)',
  escapes: [{ kind: 'client-directive', fixture: 'destructure-default-spread-const-memo-client' }],
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
export function DestructureDefaultSpreadConstMemo(props: { b?: string[] }) {
  const { b = ['y'] } = props
  const local = [...b, 'z']
  const n = createMemo(() => local.length)
  return <p>{n()}</p>
}
`,
  props: {},
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->2<!--/--></p>
  `,
})
