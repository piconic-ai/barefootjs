import { createFixture } from '../src/types'

/**
 * A literal `htmlFor`, a closed rest spread that omits it, an open bag
 * carrying the key spelled as the attribute (`for`), and the rest again.
 * The bag writes the same attribute, so it displaces the literal: one
 * `for="bag"`.
 */
export const fixture = createFixture({
  id: 'spread-closed-rest-repeated-attr-spelled-bag-key',
  description: 'An open bag key spelled as the attribute (for) displaces a literal htmlFor between two closed rest spreads',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type P = { htmlFor?: string }
export function SpreadClosedRestRepeatedAttrSpelledBagKey({ ...rest }: P) {
  const [b] = createSignal<Record<string, string>>({ for: 'bag' })
  return <label htmlFor="lit" {...rest} {...b()} {...rest}>x</label>
}
`,
  props: {},
  expectedHtml: `
    <label bf-s="test" bf="s0" for="bag">x</label>
  `,
})
