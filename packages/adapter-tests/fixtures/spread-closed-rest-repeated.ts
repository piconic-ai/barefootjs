import { createFixture } from '../src/types'

/**
 * A literal `title` followed by the same closed rest spread twice, with
 * nothing between them. The caller omits the optional `title`, so the rest
 * never writes it and the literal renders, once: the last expansion carries
 * the earlier ones as its fallback and the first one drops the key. Sibling:
 * `-last` (the caller passes `title`); the shapes with an open spread between
 * the two rests are `-around-bag`, `-both`, `-renamed-bag-key`,
 * `-attr-spelled-bag-key` and `-child-prop`.
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
