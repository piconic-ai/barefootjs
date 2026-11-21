import { createFixture } from '../src/types'

/**
 * A literal `title` before an open spread of an optional prop the caller
 * omits. JSX spreads an omitted bag as nothing, so the guard that drops the
 * literal when the bag carries the key reads it nullish-safely
 * (`bag?.title`) and the literal renders.
 */
export const fixture = createFixture({
  id: 'spread-optional-bag-literal-before',
  description: 'A literal before an omitted optional bag spread renders',
  source: `
type P = { bag?: Record<string, string> }
export function SpreadOptionalBagLiteralBefore({ bag }: P) {
  return <p title="fallback" {...bag}>a</p>
}
`,
  props: {},
  expectedHtml: `
    <p bf-s="test" bf="s0" title="fallback">a</p>
  `,
})
