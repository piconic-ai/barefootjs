import { createFixture } from '../src/types'

/**
 * `/* @client *​/` twin of `format-date` (#3089). The marker defers each
 * `formatDate(...)` read to client evaluation, so both slots render empty on
 * every adapter and no BF056 may fire — same pattern as
 * `filter-nested-callback-predicate-client`.
 */
export const fixture = createFixture({
  id: 'format-date-client',
  description: 'formatDate(...) deferred with /* @client */ suppresses BF056',
  source: `
'use client'
import { formatDate } from '@barefootjs/client'

function FormatDateClientFixture({ ok, createdAt }: { ok: boolean; createdAt: Date }) {
  return (
    <div>
      <time>{/* @client */ formatDate(createdAt, 'YYYY-MM-DD')}</time>
      <span title={/* @client */ ok ? formatDate(createdAt, 'YYYY-MM-DD') : 'n/a'}>x</span>
    </div>
  )
}
export { FormatDateClientFixture }
`,
  props: { ok: true, createdAt: new Date('2024-01-01T23:00:00.000Z') },
  expectedHtml: `
    <div bf-s="test">
      <time bf="s1"></time>
      <span bf="s2">x</span>
    </div>
  `,
})
