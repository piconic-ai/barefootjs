import { createFixture } from '../src/types'

// A memo derived from `createSearchParams()` with NO `??` default (#2075) — the
// bare-getter sibling of `search-params-derived-memo`. With the harness's empty
// query, every adapter must render the memo as EMPTY: Hono/CSR evaluate
// `searchParams().get('q')` to JS `null`; Mojo/Xslate seed
// `$searchParams->get('q')` in-template (Perl undef); Go computes the
// constructor field from `in.SearchParams.Get("q")` (Go's zero string `""`).
export const fixture = createFixture({
  id: 'search-params-derived-memo-bare',
  description: 'a memo derived from createSearchParams() with no default SSR-computes as empty',
  source: `
'use client'
import { createMemo, createSearchParams } from '@barefootjs/client'
export function QueryEcho() {
  const [searchParams] = createSearchParams()
  const q = createMemo(() => searchParams().get('q'))
  return <p>q: {q()}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s1">q: <!--bf:s0--><!--/--></p>
  `,
})
