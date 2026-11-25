import { createFixture } from '../src/types'

/**
 * A literal written before an open rest bag (`[key: string]: unknown`) that
 * may carry the same attribute under its React-style spread key. JSX keeps
 * the last write, so a bag holding `htmlFor` wins over the earlier
 * `htmlFor="explicit"` and the element renders one `for`, the bag's; a key
 * the bag lacks (`className`, `httpEquiv`) keeps the literal.
 *
 * `expectedHtml` is hand-authored (`SKIP_AUTO_UPDATE`): the Hono reference
 * writes the literal as `for` and the bag key as `htmlFor`, which its JSX
 * renderer then also writes as `for`, so it renders two `for` attributes
 * and a browser keeps the first (limitation
 * `spread-key-alias-literal-duplicate`).
 */
export const fixture = createFixture({
  id: 'spread-open-bag-literal-alias-before',
  description: 'A literal htmlFor before an open bag carrying htmlFor renders the bag value once; literals the bag lacks stay',
  source: `
type P = { [key: string]: unknown }
export function SpreadOpenBagLiteralAliasBefore({ ...rest }: P) {
  return (
    <div>
      <label htmlFor="explicit" className="lit" {...rest}>x</label>
      <meta httpEquiv="refresh" {...rest} />
    </div>
  )
}
`,
  props: { htmlFor: 'spread', id: 'i' },
  expectedHtml: `
    <div bf-s="test">
      <label bf="s0" class="lit" for="spread" id="i">x</label>
      <meta bf="s1" for="spread" http-equiv="refresh" id="i">
    </div>
  `,
})
