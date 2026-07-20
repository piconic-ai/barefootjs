import { createFixture } from '../src/types'

/**
 * Named-IANA-zone `timeZone` in the literal-locale `toLocaleDateString`
 * sugar (#2344): a canonical zone ID the build machine's Intl probe
 * verifies (`resolvedOptions().timeZone` echoes it verbatim) compiles to
 * the same neutral `format_date` helper-call as the fixed-offset form —
 * the tz literal rides through and each backend resolves it via its OWN
 * tzdata at render time (Go `time.LoadLocation`, Ruby tzinfo, PHP
 * `DateTimeZone`, Perl `DateTime::TimeZone`, Python `zoneinfo`, Rust
 * `chrono-tz`). Unknown zones, non-canonical spellings, and link names
 * still decline to BF021 (`date-method-uncatalogued` stays the refusal
 * pin for the zero-arg shape).
 *
 * The two cells split on DST-awareness: `Asia/Tokyo` is a flat +09:00
 * while `America/New_York` flips between -05:00 (EST) and -04:00 (EDT),
 * and the base instant (04:30Z) sits inside the window where THAT flip
 * changes the rendered date — the `winter-vs-summer` data point crosses
 * the flip, so an offset-frozen (non-tzdata) backend implementation
 * cannot pass both points.
 */
export const fixture = createFixture({
  id: 'date-tolocale-named-tz',
  description: 'toLocaleDateString with a canonical IANA timeZone compiles to format_date and resolves via backend tzdata',
  source: `
function DateToLocaleNamedTz({ createdAt }: { createdAt: Date }) {
  return (
    <div>
      <time>{createdAt.toLocaleDateString('en-US', { timeZone: 'Asia/Tokyo' })}</time>
      <span>{createdAt.toLocaleDateString('ja-JP', { timeZone: 'America/New_York' })}</span>
    </div>
  )
}
export { DateToLocaleNamedTz }
`,
  // Summer instant, 04:30Z: Tokyo renders July 4; New York is in EDT
  // (-04:00), 00:30 local, so it ALSO renders July 4 — where the winter
  // offset would render July 3.
  props: { createdAt: new Date('2024-07-04T04:30:00.000Z') },
  dataPoints: [
    // Winter instant at the same wall-clock offset window: New York is in
    // EST (-05:00), 23:30 the previous day — the date flips backward while
    // Tokyo stays same-day. An implementation that froze either offset
    // fails one of the two points.
    { name: 'winter-vs-summer', props: { createdAt: new Date('2024-01-04T04:30:00.000Z') } },
    // Tokyo boundary cross: 15:00Z is exactly midnight +09:00 the next day.
    { name: 'tokyo-boundary', props: { createdAt: new Date('2024-03-31T15:00:00.000Z') } },
  ],
  expectedHtml: `
    <div bf-s="test">
      <time bf="s1"><!--bf:s0-->7/4/2024<!--/--></time>
      <span bf="s3"><!--bf:s2-->2024/7/4<!--/--></span>
    </div>
  `,
})
