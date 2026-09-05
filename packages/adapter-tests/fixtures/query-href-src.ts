import { createFixture } from '../src/types'

/**
 * `queryHref(base, { … })` landing in a NON-`href` attribute (`src`) —
 * the attribute-agnostic twin of `query-href.ts` (#2743). `queryHref`
 * itself returns a plain `string`; nothing about it is href-specific, so
 * an adapter's fix for the `href` URL-context-escaper divergence must not
 * be keyed on the attribute name `href` — any URL-context attribute
 * (`src`, `action`, `data-*`, …) built from `queryHref` needs the same
 * byte parity with the JS reference (Hono, HTML-escape only).
 */
export const fixture = createFixture({
  id: 'query-href-src',
  description: 'queryHref(base, {…}) lowers to the query helper in a non-href (src) attribute',
  source: `
import { queryHref } from '@barefootjs/client'

function QueryHrefImage({ base, w }: { base: string; w: string }) {
  return <img src={queryHref(base, { w: w })} alt="thumb" />
}
export { QueryHrefImage }
`,
  props: { base: '/thumb', w: '64' },
  expectedHtml: `
    <img alt="thumb" bf-s="test" bf="s0" src="/thumb?w=64">
  `,
})
