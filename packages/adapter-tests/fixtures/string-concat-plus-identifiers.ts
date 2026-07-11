import { createFixture } from '../src/types'

/**
 * String concatenation via `+` between two BARE IDENTIFIERS — two
 * destructured string props, and a same-file string `const` — rather than
 * a string literal, template literal, zero-arg getter, or `props.x`
 * member (`string-concat-plus`'s shape). #2212: `isStringTypedOperand`
 * (`@barefootjs/jsx`) previously had no `identifier` arm, so this shape
 * fell through to numeric `+` on backends whose native `+` is
 * numeric-only (Twig, Blade, Mojolicious, Xslate — PHP/Perl), fataling
 * (PHP) or silently coercing to `0` (Perl) instead of concatenating.
 */
export const fixture = createFixture({
  id: 'string-concat-plus-identifiers',
  description: 'String concatenation via + between two bare-identifier string values (props and a local const)',
  source: `
function StringConcatPlusIdentifiers({ first, last }: { first: string; last: string }) {
  const separator: string = ' '
  return <div>{first + separator + last}</div>
}
export { StringConcatPlusIdentifiers }
`,
  props: { first: 'Ada', last: 'Lovelace' },
  expectedHtml: `
    <div bf-s="test" bf="s1"><!--bf:s0-->Ada Lovelace<!--/--></div>
  `,
})
