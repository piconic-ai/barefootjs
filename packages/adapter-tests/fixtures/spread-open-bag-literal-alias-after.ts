import { createFixture } from '../src/types'

/**
 * An attribute written after an open spread whose bag carries the same
 * attribute under its React-style spread key (`htmlFor` for `for`,
 * `httpEquiv` for `http-equiv`). JSX keeps the last write, so the element
 * renders the attribute once, with the later write, whether it is a literal
 * or an expression; the bag's other keys (`httpEquiv` on the first label,
 * `htmlFor` on the meta, `id`) still render.
 *
 * The reference writes the later attribute as `for` and the bag key
 * `htmlFor` as `for` too, two keys of its props object, so it clears the
 * bag's key after the attribute (`IRAttribute.spreadAliasShadows`).
 */
export const fixture = createFixture({
  id: 'spread-open-bag-literal-alias-after',
  description: 'An attribute after an open bag carrying its htmlFor / httpEquiv spread key renders once, with the later write',
  source: `
type P = { label?: string; attrs?: Record<string, string>; [key: string]: unknown }
export function SpreadOpenBagLiteralAliasAfter({ label, attrs, ...rest }: P) {
  return (
    <div>
      <label {...rest} htmlFor="explicit">a</label>
      <label {...attrs} htmlFor={label}>b</label>
      <meta {...rest} httpEquiv="h" />
    </div>
  )
}
`,
  props: { label: 'L', attrs: { htmlFor: 'from-attrs', id: 'i' }, htmlFor: 'spread', httpEquiv: 'refresh' },
  expectedHtml: `
    <div bf-s="test">
      <label bf="s0" for="explicit" http-equiv="refresh">a</label>
      <label bf="s1" for="L" id="i">b</label>
      <meta bf="s2" for="spread" http-equiv="h">
    </div>
  `,
})
