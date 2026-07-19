import { createFixture } from '../src/types'

/**
 * The pure-function date formatter `formatDate(date, pattern, timeZone)`
 * (#2324, `@barefootjs/client`), lowered to the neutral `format_date`
 * helper-call and rendered through every backend's `format_date` runtime
 * helper (spec/template-helpers.md). Three call shapes in text position:
 * the 2-arg form (tz normalized to 'UTC' by the lowering), a positive
 * offset with non-token literal characters (年月日), and a negative
 * half-hour offset — the base props instant sits at 23:00Z so the +09:00
 * rendering crosses the date boundary forward, pinning that the offset is
 * applied to the instant, not string-spliced.
 *
 * Like `date-catalogued`, the systematic epoch / pre-1970 / leap-day /
 * year-9999 grid is contributed by the type-derived adversarial catalogue
 * for the `Date`-typed prop; the hand-declared points here exercise the
 * offset interactions that grid can't reach (backward boundary cross,
 * leap-day reached only through the negative offset).
 */
export const fixture = createFixture({
  id: 'format-date',
  description: 'formatDate(date, pattern, timeZone) renders via the catalogued format_date helper',
  source: `
import { formatDate } from '@barefootjs/client'

function FormatDateFixture({ createdAt }: { createdAt: Date }) {
  return (
    <div>
      <time>{formatDate(createdAt, 'YYYY-MM-DD')}</time>
      <span>{formatDate(createdAt, 'YYYY年M月D日', '+09:00')}</span>
      <span>{formatDate(createdAt, 'M/D/YYYY', '-05:30')}</span>
    </div>
  )
}
export { FormatDateFixture }
`,
  props: { createdAt: new Date('2024-01-01T23:00:00.000Z') },
  dataPoints: [
    // Early-morning instant: the -05:30 rendering crosses the date boundary
    // BACKWARD (2023-12-31) while +09:00 stays same-day.
    { name: 'boundary-backward', props: { createdAt: new Date('2024-01-01T01:00:00.000Z') } },
    // Midnight after a leap day: the -05:30 rendering lands ON 2024-02-29,
    // reaching the leap day only through the offset arithmetic.
    { name: 'leap-day-via-offset', props: { createdAt: new Date('2024-03-01T00:00:00.000Z') } },
  ],
  expectedHtml: `
    <div bf-s="test">
      <time bf="s1"><!--bf:s0-->2024-01-01<!--/--></time>
      <span bf="s3"><!--bf:s2-->2024年1月2日<!--/--></span>
      <span bf="s5"><!--bf:s4-->1/1/2024<!--/--></span>
    </div>
  `,
})
