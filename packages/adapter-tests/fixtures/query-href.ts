import { createFixture } from '../src/types'

/**
 * `queryHref(base, { … })` lowering through the builtin lowering-plugin
 * registry (#2042 / #2057) — the call lowers to each adapter's query
 * helper (`bf_query` / `bf->query` / `$bf.query`) via the neutral
 * `guard-list` node, never adapter-specific recognition. One plain
 * `key: v` include (truthy-omit) and one conditional `key: cond ? v : ''`
 * include (guarded) cover both triple forms `matchQueryHrefCall` accepts.
 * Denominator entry for the coverage ledger's builtin-lowering floor
 * (`lowering:queryHref` axis).
 */
export const fixture = createFixture({
  id: 'query-href',
  description: 'queryHref(base, {…}) lowers to the query helper via the builtin plugin registry',
  source: `
import { queryHref } from '@barefootjs/client'

function QueryHrefLink({ base, tag, page }: { base: string; tag: string; page: string }) {
  return <a href={queryHref(base, { tag: tag, page: page ? page : '' })}>filter</a>
}
export { QueryHrefLink }
`,
  props: { base: '/items', tag: 'sale', page: '2' },
  expectedHtml: `
    <a bf-s="test" bf="s0" href="/items?tag=sale&amp;page=2">filter</a>
  `,
})
