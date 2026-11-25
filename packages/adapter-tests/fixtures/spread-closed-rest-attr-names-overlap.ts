import { createFixture } from '../src/types'

/**
 * Sibling of `spread-closed-rest-attr-names`: literal `htmlFor` and
 * `className` written before a closed rest spread that declares both keys.
 * The caller passes only `htmlFor`, so the bag's value wins for it and the
 * literal stays for `className`. Each expanded key carries its literal as a
 * fallback and keeps the bag's spelling, so it still renders as `for` /
 * `class`, once.
 */
export const fixture = createFixture({
  id: 'spread-closed-rest-attr-names-overlap',
  description: 'Literal htmlFor / className before a closed rest spread render once as for / class',
  source: `
type P = { className?: string; htmlFor?: string }
export function SpreadClosedRestAttrNamesOverlap({ ...rest }: P) {
  return <label htmlFor="x" className="c" {...rest}>a</label>
}
`,
  props: { htmlFor: 'f' },
  expectedHtml: `
    <label bf-s="test" class="c" for="f">a</label>
  `,
})
