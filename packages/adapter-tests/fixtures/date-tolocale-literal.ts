import { createFixture } from '../src/types'

/**
 * Literal-locale `toLocaleDateString` sugar (#2324 slice 2): a `Date`-typed
 * prop's `.toLocaleDateString(<literal locale>, { timeZone: <literal> })`
 * resolves the locale's default date pattern once at BUILD time and lowers
 * to the same neutral `format_date` helper-call as `formatDate(...)` — so
 * the template adapters render the frozen pattern with no runtime ICU,
 * while Hono (evaluating real ECMA-402 against the same build-machine ICU)
 * must agree byte-for-byte. The client JS is rewritten to
 * `formatDate(recv, pattern, tz)` (#2292-style), which the CSR conformance
 * side exercises.
 *
 * The zero-arg sibling stays refused — see `date-method-uncatalogued` —
 * as do runtime locales (implicit environment;
 * `to-locale-date-lowering.ts` module doc). Canonical IANA zone names
 * compile since #2344 — see `date-tolocale-named-tz`.
 *
 * The base instant sits at 23:00Z so the `+09:00` cell crosses the date
 * boundary forward. The type-derived adversarial grid contributes the
 * epoch / pre-1970 / leap-day / year-9999 instants; `year-9999` × the
 * `+09:00` cell lands in year 10000, pinning that no backend's date type
 * caps out (the Python civil-from-days lesson from the `format-date`
 * fixture).
 */
export const fixture = createFixture({
  id: 'date-tolocale-literal',
  description: 'toLocaleDateString with literal locale + timeZone compiles to the format_date helper',
  source: `
function DateToLocaleLiteral({ createdAt }: { createdAt: Date }) {
  return (
    <div>
      <time>{createdAt.toLocaleDateString('en-US', { timeZone: 'UTC' })}</time>
      <span>{createdAt.toLocaleDateString('ja-JP', { timeZone: '+09:00' })}</span>
    </div>
  )
}
export { DateToLocaleLiteral }
`,
  props: { createdAt: new Date('2024-01-01T23:00:00.000Z') },
  dataPoints: [
    // Early-morning instant: the +09:00 cell stays same-day while a
    // midnight-boundary regression would show up in either cell.
    { name: 'same-day-offset', props: { createdAt: new Date('2024-01-01T01:00:00.000Z') } },
    // 15:00Z on a leap day: +09:00 crosses to March 1st while UTC stays
    // on 02-29 — the two cells disagree on month AND day.
    { name: 'leap-day-split', props: { createdAt: new Date('2024-02-29T15:00:00.000Z') } },
  ],
  expectedHtml: `
    <div bf-s="test">
      <time bf="s1"><!--bf:s0-->1/1/2024<!--/--></time>
      <span bf="s3"><!--bf:s2-->2024/1/2<!--/--></span>
    </div>
  `,
})
