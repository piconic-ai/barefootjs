import { createFixture } from '../src/types'

// A list-filter memo chained off a `createSearchParams()`-derived memo — the
// blog PostList's `visible` shape (#1938/#1939, #2075). With no query string
// the tag memo defaults to '' and the `!tag()` guard keeps every item, so the
// SSR list is the full set — previously the template adapters seeded nothing
// and rendered an empty list.
//
// Mojo/Xslate seed both memos in-template (the filter lowers to an inline
// `grep` / `$bf.filter` closing over the seeded `$tag`). Go computes them in
// the generated constructor via `bf.FilterEval` + the evaluator's `.includes`.
export const fixture = createFixture({
  id: 'search-params-derived-filter',
  description: 'a filter memo chained off a searchParams()-derived memo SSR-renders the list',
  source: `
'use client'
import { createMemo, createSearchParams } from '@barefootjs/client'
export function TaggedList(props: { items: { title: string; tags: string[] }[] }) {
  const [searchParams] = createSearchParams()
  const tag = createMemo(() => searchParams().get('tag') ?? '')
  const visible = createMemo(() => props.items.filter((p) => !tag() || p.tags.includes(tag())))
  return <ul>{visible().map((p) => <li key={p.title}>{p.title}</li>)}</ul>
}
`,
  props: {
    items: [
      { title: 'Alpha', tags: ['perl'] },
      { title: 'Beta', tags: ['go'] },
      { title: 'Gamma', tags: ['perl', 'go'] },
    ],
  },
  expectedHtml: `
    <ul bf-s="test" bf="s1">
      <li data-key="Alpha"><!--bf:s0-->Alpha<!--/--></li>
      <li data-key="Beta"><!--bf:s0-->Beta<!--/--></li>
      <li data-key="Gamma"><!--bf:s0-->Gamma<!--/--></li>
    </ul>
  `,
})
