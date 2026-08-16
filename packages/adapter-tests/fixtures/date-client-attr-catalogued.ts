import { createFixture } from '../src/types'

/**
 * `/* @client *\/` on an ATTRIBUTE binding (not a text/child expression),
 * calling a catalogued Date method (#2641). `date-client-catalogued` pins
 * the text-position sibling of this same fix; this fixture pins the
 * attribute-position emission site — `emitReactiveAttributeUpdates`
 * (`ir-to-client-js/emit-reactive.ts`), a separate code path from
 * `emitClientOnlyExpressions` that had the identical verbatim-splice gap
 * before #2640/#2641's fix (`makeCataloguedCallLowerer` is now shared by
 * both sites, plus the non-`@client` reactive-attribute path — see
 * `date-catalogued-attr` for that sibling).
 *
 * `spec/compiler.md` documents `data-x={/* @client *\/ pred(item)}` as a
 * supported shape: the adapters omit the attribute entirely from SSR output
 * (nothing to adopt), and the client runtime sets it in a mount effect —
 * this fixture is the first to pin that SSR-omission shape specifically for
 * a Date-typed `/* @client *\/` attribute.
 */
export const fixture = createFixture({
  id: 'date-client-attr-catalogued',
  description: '/* @client */ attribute binding with a catalogued Date method (toISOString) — hydrate-safe via date(), attribute omitted at SSR',
  source: `
export function DateClientAttrCatalogued({ createdAt }: { createdAt: Date }) {
  return <div data-iso={/* @client */ createdAt.toISOString()} />
}
`,
  props: { createdAt: '2024-01-01T00:00:00.000Z' },
  expectedHtml: `
    <div bf-s="test" bf="s0"></div>
  `,
})
