import { createFixture } from '../src/types'

/**
 * An open rest bag carrying the other React-style keys the reference
 * renames when it renders a spread (`crossOrigin`, `itemProp`,
 * `fetchPriority`, `noModule`, `formAction`), next to camelCase keys it
 * writes as they are (`tabIndex`, `maxLength`, `ariaLabel`, `dataTestId`,
 * `strokeWidth`) and an SVG name whose case it keeps (`viewBox`). Every
 * value is a string, so no boolean-attribute rule takes part.
 */
export const fixture = createFixture({
  id: 'spread-open-bag-hono-renamed-keys',
  description: 'Open rest bag renames only the spread keys the reference renames and writes other camelCase keys as they are',
  source: `
type P = { [key: string]: unknown }
export function SpreadOpenBagHonoRenamedKeys({ ...rest }: P) {
  return <p {...rest}>x</p>
}
`,
  props: {
    crossOrigin: 'anonymous',
    itemProp: 'name',
    fetchPriority: 'high',
    noModule: 'm',
    formAction: '/go',
    tabIndex: '0',
    maxLength: '3',
    ariaLabel: 'l',
    dataTestId: 'd',
    strokeWidth: '2',
    viewBox: '0 0 1 1',
  },
  expectedHtml: `
    <p ariaLabel="l" bf-s="test" bf="s0" crossorigin="anonymous" dataTestId="d" fetchpriority="high" formaction="/go" itemprop="name" maxLength="3" nomodule="m" strokeWidth="2" tabIndex="0" viewBox="0 0 1 1">x</p>
  `,
})
