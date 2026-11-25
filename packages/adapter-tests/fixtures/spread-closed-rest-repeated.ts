import { createFixture } from '../src/types'

/**
 * A literal `title` followed by the same closed rest spread twice, with
 * nothing between them. The caller omits the optional `title`, so the rest
 * never writes it and the literal renders, once. Every expansion of the
 * repeated rest is kept as on main (limitation `closed-rest-repeated`), so
 * the template adapters render it once per expansion. Sibling: `-last` (the
 * caller passes `title`); with an open spread between the rests:
 * `-around-bag`, `-both`, `-after-bag`, `-attr-spelled-bag-key`.
 */
export const fixture = createFixture({
  id: 'spread-closed-rest-repeated',
  description: 'A literal before a closed rest spread twice renders once when the rest omits its key',
  source: `
type P = { title?: string }
export function SpreadClosedRestRepeated({ ...rest }: P) {
  return <p title="fallback" {...rest} {...rest}>a</p>
}
`,
  props: {},
  expectedHtml: `
    <p bf-s="test" title="fallback">a</p>
  `,
})
