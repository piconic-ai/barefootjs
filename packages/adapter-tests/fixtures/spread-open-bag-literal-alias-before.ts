import { createFixture } from '../src/types'

/**
 * A literal written before an open rest bag (`[key: string]: unknown`) that
 * may carry the same attribute under its React-style spread key. JSX keeps
 * the last write, so a bag holding `htmlFor` wins over the earlier
 * `htmlFor="explicit"` and the element renders one `for`, the bag's; a key
 * the bag lacks (`className`, `httpEquiv`) keeps the literal.
 *
 * The reference writes the literal as `for` and the bag key `htmlFor` as
 * `for` too, two keys of its props object, so it renders the literal only
 * when the bag lacks `htmlFor` (`IRAttribute.spreadAliasOverriders`).
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
