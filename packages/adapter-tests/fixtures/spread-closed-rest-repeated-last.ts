import { createFixture } from '../src/types'

/**
 * Sibling of `spread-closed-rest-repeated` where the caller passes `title`:
 * the last closed rest spread is the last write, so `title` renders once,
 * with the rest's value.
 */
export const fixture = createFixture({
  id: 'spread-closed-rest-repeated-last',
  description: 'A closed rest spread repeated after a literal renders the rest value once',
  source: `
type P = { title?: string }
export function SpreadClosedRestRepeatedLast({ ...rest }: P) {
  return <p title="fallback" {...rest} {...rest}>a</p>
}
`,
  props: { title: 'last' },
  expectedHtml: `
    <p bf-s="test" title="last">a</p>
  `,
})
