import { createFixture } from '../src/types'

/**
 * Markup calling a literal const's method that spreads a defaulted
 * body-destructured prop (#3954): `{api.add()}` for `const api = { add: () =>
 * [...b, 'z'].length }`. The emitters inline the method's body, which holds an
 * element no template lowers, without refusing it: the text rendered empty
 * (and Go failed at render) where Hono renders `2`. Every template adapter
 * refuses it (BF101); `/* @client *\/` defers the read
 * (`destructure-default-spread-method-text-client`).
 */
export const fixture = createFixture({
  id: 'destructure-default-spread-method-text',
  description: 'Markup calling a literal const method that spreads a defaulted destructured array prop renders the length (#3954)',
  escapes: [{ kind: 'client-directive', fixture: 'destructure-default-spread-method-text-client' }],
  source: `
'use client'
export function DestructureDefaultSpreadMethodText(props: { b?: string[] }) {
  const { b = ['y'] } = props
  const api = { add: () => [...b, 'z'].length }
  return <p>{api.add()}</p>
}
`,
  props: {},
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->2<!--/--></p>
  `,
})
