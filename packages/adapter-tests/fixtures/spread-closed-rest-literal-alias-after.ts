import { createFixture } from '../src/types'

/**
 * A closed rest spread whose keys are the React-style names a spread
 * renames, followed by literals for every one of them. JSX keeps the last
 * write, so each attribute renders once, with the literal, both for a key
 * the caller passed (`className`, `htmlFor`) and for one it omitted; a key
 * no later attribute writes (`title`) still comes from the rest.
 */
export const fixture = createFixture({
  id: 'spread-closed-rest-literal-alias-after',
  description: 'Literals after a closed rest spread win once over its className / htmlFor / other renamed keys',
  source: `
type P = {
  className?: string
  htmlFor?: string
  crossOrigin?: string
  httpEquiv?: string
  itemProp?: string
  fetchPriority?: string
  noModule?: string
  formAction?: string
  title?: string
}
export function SpreadClosedRestLiteralAliasAfter({ ...rest }: P) {
  return (
    <label
      {...rest}
      className="c"
      htmlFor="explicit"
      crossOrigin="use-credentials"
      httpEquiv="h"
      itemProp="ip"
      fetchPriority="low"
      noModule="n"
      formAction="/f"
    >x</label>
  )
}
`,
  props: { className: 'k', htmlFor: 'spread', title: 't' },
  expectedHtml: `
    <label bf-s="test" class="c" crossorigin="use-credentials" fetchpriority="low" for="explicit" formaction="/f" http-equiv="h" itemprop="ip" nomodule="n" title="t">x</label>
  `,
})
