import { createFixture } from '../src/types'

/**
 * Union-typed locale `toLocaleDateString` (#2324's union stage): the locale
 * argument is a RUNTIME value, but its TS type is a required closed
 * string-literal union — so the compiler resolves every member's pattern at
 * build time and lowers the pattern argument to a ternary over the runtime
 * value, still with zero runtime CLDR on any backend. The client JS is
 * rewritten to the same ternary `formatDate(...)` form.
 *
 * The base props render the `en-US` arm; the `ja-jp-arm` oracle point flips
 * the locale prop so the OTHER branch of the lowered ternary is compared
 * live against the JS reference render on every adapter — both arms of the
 * pattern table are pinned, not just the one the frozen expectedHtml shows.
 *
 * Open `locale: string`, optional unions, and unions with an
 * unrepresentable member (`'ar-SA'`) keep refusing — see
 * `to-locale-date-lowering.ts`'s module doc and unit tests.
 */
export const fixture = createFixture({
  id: 'date-tolocale-union',
  description: 'toLocaleDateString with a union-typed runtime locale lowers to a build-time pattern ternary',
  source: `
function DateToLocaleUnion({ createdAt, locale }: { createdAt: Date; locale: 'en-US' | 'ja-JP' }) {
  return (
    <div>
      <time>{createdAt.toLocaleDateString(locale, { timeZone: 'UTC' })}</time>
    </div>
  )
}
export { DateToLocaleUnion }
`,
  props: { createdAt: new Date('2024-03-05T12:00:00.000Z'), locale: 'en-US' },
  dataPoints: [
    // The other union arm: same instant, ja-JP pattern (YYYY/M/D).
    { name: 'ja-jp-arm', props: { createdAt: new Date('2024-03-05T12:00:00.000Z'), locale: 'ja-JP' } },
    // Both arms against a zero-padding-revealing instant (single-digit
    // month AND day stay bare in both v1 patterns).
    { name: 'en-us-leap', props: { createdAt: new Date('2024-02-29T12:00:00.000Z'), locale: 'en-US' } },
    { name: 'ja-jp-leap', props: { createdAt: new Date('2024-02-29T12:00:00.000Z'), locale: 'ja-JP' } },
  ],
  expectedHtml: `
    <div bf-s="test">
      <time bf="s1"><!--bf:s0-->3/5/2024<!--/--></time>
    </div>
  `,
})
