import { createFixture } from '../src/types'

/**
 * #3044 pullfrog review (PR #3048) — coverage gap: `isPropDerivedArray`
 * (the flag `isArrayExprDirectPropRef`/`isDirectPropBindingName`, both
 * widened by #3048, compute) isn't purely a client-JS/CSR concern. The Go
 * Template adapter is the one adapter that reads it outside the compiler
 * itself (`NestedComponentInfo.isPropDerived`, `component-tree.ts`), and it
 * drives real SSR codegen — which struct field a nested CHILD COMPONENT
 * gets and what the generated `{{range}}` targets. #3048's own tests only
 * exercise plain-element (`<li>`) loop bodies over the newly-recognized
 * destructured-object-prop shape (`data.items.map(...)`); this fixture is
 * the missing combination: that same shape with a CHILD COMPONENT body,
 * mirroring `static-array-from-props-with-component-precomputed`'s
 * (#2321/#2630) shallower `props.entries.map(entry => <Tag .../>)` sibling
 * one destructure-hop deeper (`data.entries.map(entry => <Tag .../>)`
 * where `data` — not `entries` — is the prop).
 *
 * #2630's divergence for that shallower sibling already graduated (see
 * `packages/adapter-go-template/src/render-divergences.ts`'s header
 * comment) — the harness's prop-seeding for a prop-derived static
 * child-component loop is generic, not shape-specific. This deeper shape
 * turned out NOT to inherit that fix, though: KNOWN DIVERGENCE —
 * go-template renders the `<ul>` EMPTY here (see `render-divergences.ts`'s
 * `nested-prop-object-array-child-component-go` entry). Hono and CSR both
 * render correctly; this fixture exists to pin the Go gap as an executed,
 * CI-verified fact rather than an inference from a sibling fixture.
 */
export const fixture = createFixture({
  id: 'nested-prop-object-array-with-component',
  description: '#3044: a nested array on a destructured object prop, mapped to a child component — renders correctly on Hono/CSR; KNOWN DIVERGENCE on go-template (empty render, see render-divergences.ts)',
  source: `
'use client'
import { Tag } from './tag'

type Entry = {
  id: string
  variant: 'on' | 'off'
}

type Data = {
  entries: Entry[]
}

export function TagList({ data }: { data: Data }) {
  return (
    <ul>
      {data.entries.map(entry => (
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
    data: {
      entries: [
        { id: 'a', variant: 'on' },
        { id: 'c', variant: 'on' },
      ],
    },
  },
  expectedHtml: `
    <ul bf-s="test" bf="s1">
      <span bf-s="Tag_*" bf="s1" class="tag-on" data-key="a"><!--bf:s0-->a<!--/--></span>
      <span bf-s="Tag_*" bf="s1" class="tag-on" data-key="c"><!--bf:s0-->c<!--/--></span>
    </ul>
  `,
})
