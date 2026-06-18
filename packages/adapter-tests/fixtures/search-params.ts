import { createFixture } from '../src/types'

// `searchParams()` (router v0.5) is a request-scoped reactive environment
// signal. Reading it in a component compiles to a normal dynamic-text binding;
// on the server it resolves the current request's query (empty here, since the
// conformance harness issues no query string), so `.get('sort') ?? 'none'`
// renders the default `none`.
//
// This is the cross-adapter twin of the client-side `env-signal.test.ts` and
// the Hono `search-params-ssr.test.ts`. It now runs on every adapter — Hono,
// Go, Mojolicious, and Xslate — after env-signal SSR lowering + per-request
// runtimes landed for the template-string adapters in
// https://github.com/piconic-ai/barefootjs/issues/1922.
export const fixture = createFixture({
  id: 'search-params',
  description: 'searchParams() env signal renders its empty-query default at SSR',
  source: `
import { searchParams } from '@barefootjs/client'
export function SortLabel() {
  return <p>{searchParams().get('sort') ?? 'none'}</p>
}
`,
  expectedHtml: `
    <p bf-s="test"><!--bf:s0-->none<!--/--></p>
  `,
})
