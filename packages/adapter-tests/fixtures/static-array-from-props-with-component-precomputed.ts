import { createFixture } from '../src/types'

/**
 * `prop-precompute` twin of `static-array-from-props-with-component`
 * (#2321) — the child-component counterpart of
 * `static-array-from-props-precomputed`.
 *
 * The base refuses on the DSL adapters because the loop array is a
 * component-scope `const` with a computed initializer
 * (`Object.entries(props.tags).filter(...)`). Here the caller passes the
 * already-filtered array in as a prop, so the loop source is a plain
 * prop the adapters bind directly, and the `<Tag>` child body — the part
 * this fixture family exists to cover (#1268) — still renders through the
 * childComponent path at SSR.
 *
 * Contrast with the `-client` twin, visible in the committed
 * `expectedHtml` of each: that one renders `<ul></ul>` and materializes
 * the tags at hydration; this one renders the `<span>` children on the
 * server. Same refusal, two escapes, two different `ssrCost` values
 * (`ESCAPE_SSR_COST`, `packages/jsx/src/types.ts`).
 *
 * KNOWN DIVERGENCE — go-template renders the `<ul>` EMPTY here (#2630),
 * pinned in that adapter's `renderDivergences`. It compiles clean and
 * `go run`s clean; the child rows simply never materialize. The sibling
 * `static-array-from-props-precomputed` — same shape with an inline
 * element body instead of a `<Tag>` child — renders correctly
 * everywhere, so what this fixture pins is specifically a
 * child-component body over a prop-backed array.
 *
 * That means this twin proves `prop-precompute` on eight adapters, NOT
 * nine. The `expectedHtml` below is the reference output (correct), not
 * what go-template currently produces, so deleting the divergence entry
 * once #2630 is fixed turns this fixture into that fix's regression test.
 *
 * Shape note: like its sibling, the precomputed array holds OBJECTS
 * rather than the base's `[id, t]` pairs — an array-destructured loop
 * param is itself a refusal shape on several DSL adapters (#1266), so
 * keeping it would trade one refusal for another and prove nothing about
 * `prop-precompute`.
 */
export const fixture = createFixture({
  id: 'static-array-from-props-with-component-precomputed',
  description: 'prop-precompute twin of static-array-from-props-with-component — child components render at SSR (#2321)',
  source: `
'use client'
import { Tag } from './tag'

type Entry = {
  id: string
  variant: 'on' | 'off'
}

type Props = {
  entries: Entry[]
}

export function TagList(props: Props) {
  return (
    <ul>
      {props.entries.map(entry => (
        <Tag key={entry.id} id={entry.id} variant={entry.variant} />
      ))}
    </ul>
  )
}
`,
  components: {
    './tag.tsx': `
'use client'
export function Tag(props: { id: string; variant: 'on' | 'off' }) {
  return <span class={'tag-' + props.variant}>{props.id}</span>
}
`,
  },
  props: {
    entries: [
      { id: 'a', variant: 'on' },
      { id: 'c', variant: 'on' },
    ],
  },
  expectedHtml: `
    <ul bf-s="test" bf="s1">
      <span bf-s="Tag_*" bf="s1" class="tag-on" data-key="a"><!--bf:s0-->a<!--/--></span>
      <span bf-s="Tag_*" bf="s1" class="tag-on" data-key="c"><!--bf:s0-->c<!--/--></span>
    </ul>
  `,
})
