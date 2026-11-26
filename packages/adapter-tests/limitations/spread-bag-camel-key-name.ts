import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'An open spread bag key in camelCase outside the spread renames',
  given:
    'an open spread (`{...rest}` with an index-signature props type) whose bag holds a camelCase key other than `className`, `htmlFor` and `httpEquiv`: one the reference renames (`crossOrigin`, `itemProp`, `fetchPriority`, `noModule`, `formAction`) or one it writes as it is (`tabIndex`, `ariaLabel`, `dataTestId`, `strokeWidth`)',
  expected:
    'the five renamed keys render lowercased (`crossorigin`, `itemprop`, `fetchpriority`, `nomodule`, `formaction`) and every other key renders with the bag\'s spelling (`tabIndex`, `ariaLabel`, `dataTestId`, `strokeWidth`)',
  actual: 'Renders every camelCase key kebab-cased (`cross-origin`, `tab-index`, `aria-label`, `data-test-id`, `stroke-width`)',
  fixtures: ['spread-open-bag-hono-renamed-keys', 'spread-closed-rest-then-bag-renamed-key', 'spread-open-bag-literal-case-alias'],
})
