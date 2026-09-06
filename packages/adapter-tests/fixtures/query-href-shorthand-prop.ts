import { createFixture } from '../src/types'

/**
 * `queryHref(base, { … })` whose object literal uses object-literal
 * SHORTHAND (`{ tag, page }`) rather than explicit `key: value` pairs
 * (`query-href.ts`'s shape). `collectAstPropRefs` (`prop-rewrite.ts`)
 * used to skip a shorthand property assignment entirely when
 * discovering which destructured props a reactive-attribute expression
 * references, so `rewriteBarePropRefs` found zero prop refs and never
 * rewrote the expression at all — the reactive `createEffect` body and
 * the CSR hydrate template lambda both kept the bare `{ tag, page }`
 * text, referencing identifiers that don't exist in that lambda's
 * scope (`ReferenceError` at hydrate time). Fixed by discovering a
 * shorthand property's name as a value reference too, matching the
 * emission side (`applyScopedPropRefRewrite`), which already expanded
 * it correctly (#2828).
 */
export const fixture = createFixture({
  id: 'query-href-shorthand-prop',
  description: 'queryHref(base, { tag, page }) with object-literal shorthand still rewrites both props',
  source: `
import { queryHref } from '@barefootjs/client'

function QueryHrefShorthandLink({ base, tag, page }: { base: string; tag: string; page: string }) {
  return <a href={queryHref(base, { tag, page })}>filter</a>
}
export { QueryHrefShorthandLink }
`,
  props: { base: '/items', tag: 'sale', page: '2' },
  expectedHtml: `
    <a bf-s="test" bf="s0" href="/items?tag=sale&amp;page=2">filter</a>
  `,
})
