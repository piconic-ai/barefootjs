import { createFixture } from '../src/types'

/**
 * An attribute written after an open spread whose bag carries the same
 * attribute under a key the reference keeps apart from the attribute's own:
 * a key it renames in a spread (`crossOrigin` for `crossorigin`) or one that
 * spells the attribute in another letter case (`tabIndex` for `tabindex`).
 * JSX keeps the last write, so each element renders the attribute once,
 * with the later write.
 */
export const fixture = createFixture({
  id: 'spread-open-bag-literal-other-spelling-after',
  description: 'An attribute after an open bag carrying its crossOrigin / tabIndex spelling renders once, with the later write',
  source: `
type P = { [key: string]: unknown }
export function SpreadOpenBagLiteralOtherSpellingAfter({ ...rest }: P) {
  return (
    <div>
      <link {...rest} crossOrigin="use-credentials" tabIndex={3} />
    </div>
  )
}
`,
  props: { crossOrigin: 'anonymous', tabIndex: 1 },
  expectedHtml: `
    <div bf-s="test"><link bf="s0" crossorigin="use-credentials" tabindex="3"></div>
  `,
})
