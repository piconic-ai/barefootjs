import { createFixture } from '../src/types'

/**
 * Sibling of `spread-closed-rest-repeated`: the open bag between the two
 * closed rest spreads is an optional prop the caller omits. JSX spreads an
 * omitted bag as nothing, so reading its keys must not throw, and the
 * literal renders.
 */
export const fixture = createFixture({
  id: 'spread-closed-rest-repeated-optional-bag',
  description: 'An omitted optional bag between two closed rest spreads writes nothing and the literal renders',
  source: `
type P = { bag?: Record<string, string>; title?: string }
export function SpreadClosedRestRepeatedOptionalBag({ bag, ...rest }: P) {
  return <p title="fallback" {...rest} {...bag} {...rest}>a</p>
}
`,
  props: {},
  expectedHtml: `
    <p bf-s="test" bf="s0" title="fallback">a</p>
  `,
})
