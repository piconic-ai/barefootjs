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
 * child-component loop is generic, not shape-specific — so this fixture is
 * expected to render correctly everywhere, including Go. It exists to make
 * that an executed, CI-verified fact (via the real `go run` in
 * `ci-go-template.yml`) rather than an inference from a sibling fixture,
 * for the specific shape #3048 newly classifies as prop-derived.
 */
export const fixture = createFixture({
  id: 'nested-prop-object-array-with-component',
  description: '#3044: a nested array on a destructured object prop, mapped to a child component, renders at SSR on every adapter',
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
