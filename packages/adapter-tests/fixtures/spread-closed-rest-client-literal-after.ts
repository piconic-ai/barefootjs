import { createFixture } from '../src/types'

/**
 * A client-only attribute (`/* @client *\/`) written after a closed rest
 * spread that carries the same key. The server skips the client-only
 * attribute, so the rest's value is what it renders (`for="spread"`); the
 * later binding is applied at hydration.
 */
export const fixture = createFixture({
  id: 'spread-closed-rest-client-literal-after',
  description: 'A client-only htmlFor after a closed rest spread leaves the rest value in the server render',
  source: `
'use client'
type P = { htmlFor?: string; title?: string }
export function SpreadClosedRestClientLiteralAfter({ ...rest }: P) {
  return <label {...rest} htmlFor={/* @client */ 'client'}>x</label>
}
`,
  props: { htmlFor: 'spread', title: 't' },
  expectedHtml: `
    <label bf-s="test" bf="s0" for="spread" title="t">x</label>
  `,
})
