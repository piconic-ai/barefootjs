import { createFixture } from '../src/types'

/**
 * Name tokens via the options bag (#2334): `dateStyle` / field-form options
 * on the `toLocaleDateString` sugar. The compiler probes the exact literal
 * options bag with the build machine's own ICU and lowers to `format_date`
 * with the derived pattern PLUS the 38-slot name table as an ordinary
 * array argument — the backends never own locale data (type-only rule).
 *
 * Three cells:
 *   - en-US `dateStyle: 'long'` → `MMMM D, YYYY` + names ("March 5, 2024");
 *   - en-US `dateStyle: 'full'` → `dddd, MMMM D, YYYY` (weekday token —
 *     2024-03-05 is a Tuesday; the offset-shifted weekday arithmetic is
 *     what the `weekday-shift` oracle point exercises);
 *   - ja-JP `dateStyle: 'long'` → `YYYY年M月D日`, numeric — the probe
 *     discovers no names are needed and ships an empty table.
 *
 * Hono evaluates the real ECMA-402 call against the same build-machine ICU
 * the pattern+table were frozen from, so reference parity IS the fidelity
 * contract ("what the user wrote in TSX, reproduced exactly").
 */
export const fixture = createFixture({
  id: 'date-tolocale-datestyle',
  description: 'toLocaleDateString dateStyle options lower to name-token patterns + shipped name tables',
  source: `
function DateToLocaleDateStyle({ createdAt }: { createdAt: Date }) {
  return (
    <div>
      <time>{createdAt.toLocaleDateString('en-US', { dateStyle: 'long', timeZone: 'UTC' })}</time>
      <span>{createdAt.toLocaleDateString('en-US', { dateStyle: 'full', timeZone: 'UTC' })}</span>
      <span>{createdAt.toLocaleDateString('ja-JP', { dateStyle: 'long', timeZone: 'UTC' })}</span>
    </div>
  )
}
export { DateToLocaleDateStyle }
`,
  props: { createdAt: new Date('2024-03-05T12:00:00.000Z') },
  dataPoints: [
    // 23:00Z Tuesday: UTC cells stay Tuesday March 5 — pairs with the
    // weekday-shift sibling fixture cell below via the +09:00 variant in
    // unit tests; here it pins the LATE-day UTC weekday.
    { name: 'weekday-shift', props: { createdAt: new Date('2024-03-05T23:00:00.000Z') } },
    // Month-name boundary: 23:59:59.999 on Feb 29 — leap-day February in
    // every cell (wide vs abbreviated name irrelevance is pinned by the
    // grid's other instants).
    { name: 'leap-day-name', props: { createdAt: new Date('2024-02-29T23:59:59.999Z') } },
  ],
  expectedHtml: `
    <div bf-s="test">
      <time bf="s1"><!--bf:s0-->March 5, 2024<!--/--></time>
      <span bf="s3"><!--bf:s2-->Tuesday, March 5, 2024<!--/--></span>
      <span bf="s5"><!--bf:s4-->2024年3月5日<!--/--></span>
    </div>
  `,
})
