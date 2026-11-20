import { createFixture } from '../src/types'

/**
 * A memo calling a literal const's method that spreads a defaulted
 * body-destructured prop (#3954): `const api = { add: () => [...b, 'z'].length }`,
 * `createMemo(() => api.add())`. The call runs the method's body, which no
 * template computes, so the memo rendered empty where Hono renders `2`; every
 * template adapter refuses it (BF101), and `/* @client *\/` defers the read
 * (`destructure-default-spread-method-memo-client`).
 */
export const fixture = createFixture({
  id: 'destructure-default-spread-method-memo',
  description: 'A memo calling a literal const method that spreads a defaulted destructured array prop renders the length (#3954)',
  escapes: [{ kind: 'client-directive', fixture: 'destructure-default-spread-method-memo-client' }],
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
export function DestructureDefaultSpreadMethodMemo(props: { b?: string[] }) {
  const { b = ['y'] } = props
  const api = { add: () => [...b, 'z'].length }
  const n = createMemo(() => api.add())
  return <p>{n()}</p>
}
`,
  props: {},
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->2<!--/--></p>
  `,
})
