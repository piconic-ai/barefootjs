import { createFixture } from '../src/types'

// A memo DERIVED from the `createSearchParams()` env signal (#2075). #1922
// lowered the `searchParams().get()` call itself; this pins the derived-memo
// layer: the memo must SSR-compute from the per-request reader instead of
// zero-valuing. Mojo/Xslate seed it in-template
// (`my $sort = ($searchParams->get('sort') // 'date')`); Go computes it in
// the generated constructor from `in.SearchParams`. The harness issues no
// query string, so the `??` default is the rendered value — previously the
// template adapters rendered an empty string here.
//
// The getter is deliberately ALIASED (`sp`) so the seed also covers the
// canonicalisation path (`sp()` lowers to the canonical reader, not `$sp`).
export const fixture = createFixture({
  id: 'search-params-derived-memo',
  description: 'a memo derived from createSearchParams() SSR-computes its value',
  source: `
'use client'
import { createMemo, createSearchParams } from '@barefootjs/client'
export function SortStatus() {
  const [sp] = createSearchParams()
  const sort = createMemo(() => sp().get('sort') ?? 'date')
  return <p>sort: {sort()}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s1">sort: <!--bf:s0-->date<!--/--></p>
  `,
})
