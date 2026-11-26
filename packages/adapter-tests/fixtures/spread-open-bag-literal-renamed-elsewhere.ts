import { createFixture } from '../src/types'

/**
 * A literal `crossOrigin` before an open rest bag that also carries
 * `crossOrigin`. JSX keeps the last write, so the element renders one
 * `crossorigin`, the bag's.
 *
 * The reference and Pebble rename the bag's `crossOrigin` to `crossorigin`
 * (`spreadKeyRenames`), so the literal is guarded against it there and
 * renders once. The other
 * template helpers write `cross-origin` (limitation
 * `spread-bag-camel-key-name`), so the compiler keeps the literal there
 * rather than guard it against a key that renders as another attribute.
 */
export const fixture = createFixture({
  id: 'spread-open-bag-literal-renamed-elsewhere',
  description: 'A literal crossOrigin before an open bag carrying crossOrigin renders one crossorigin, the bag value',
  source: `
type P = { [key: string]: unknown }
export function SpreadOpenBagLiteralRenamedElsewhere({ ...rest }: P) {
  return <img crossOrigin="anonymous" {...rest} />
}
`,
  props: { crossOrigin: 'use-credentials' },
  expectedHtml: `
    <img bf-s="test" bf="s0" crossorigin="use-credentials">
  `,
})
