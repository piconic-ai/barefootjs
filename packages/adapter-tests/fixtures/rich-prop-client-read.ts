import { createFixture } from '../src/types'

/**
 * A `Map`-typed prop that is READ by this component's own client code (an
 * `onClick` handler) but never has a method called on it in a
 * template-lowered position — BF021 (`checkRichTypeMethodCalls`) never sees
 * this shape, so it stays clean until #2643's sibling check,
 * `checkRichTypePropSerialization` (BF049), closes the gap.
 *
 * The prop still crosses the `bf-p` hydration boundary as JSON like every
 * other prop, and `Map` is not in `JSON_REVIVABLE_RICH_TYPE_NAMES`
 * (`rich-type-evidence.ts`) — its `JSON.stringify` output is `{}`, every
 * entry silently dropped. Before #2643 this compiled clean and shipped a
 * component whose client handler always saw an empty `Map`, with zero
 * compile-time signal that the prop could never survive hydration intact.
 *
 * Every adapter shares this SAME compiler-level refusal ahead of
 * `adapter.generate()` (mirrors `date-method-uncatalogued`'s reasoning), so
 * this fixture is pinned identically across all nine adapters' own
 * `conformance-pins.ts` — including Hono. This is not a template-lowering
 * gap (no adapter is even asked to lower a `Map` into its own syntax here);
 * it is a hydration-transport gap, which is exactly as universal on Hono's
 * JS-runtime hydrate leg as on the 8 DSL adapters' leg.
 *
 * `escapes` twin: `rich-prop-precompute` — the sound escape (pass an
 * already-serializable value and rebuild the `Map` client-side) BF049's own
 * suggestion recommends.
 */
export const fixture = createFixture({
  id: 'rich-prop-client-read',
  description: 'A Map-typed prop read (not method-called) by client code refuses with BF049 — the prop cannot survive the bf-p JSON boundary',
  source: `
'use client'
export function RichPropClientRead({ data }: { data: Map<string, number> }) {
  return <button onClick={() => console.log(data.get('x'))}>go</button>
}
`,
  props: { data: {} },
  escapes: [{ kind: 'prop-precompute', fixture: 'rich-prop-precompute' }],
})
