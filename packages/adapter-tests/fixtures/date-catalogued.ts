import { createFixture } from '../src/types'

/**
 * The catalogued rich type `Date` (#2274) as a data-point prop. Two
 * zero-arg `Date.prototype` accessors in text position — `toISOString()`
 * (string) and `getUTCFullYear()` (integer) — both lowered to the neutral
 * `date` helper-call and rendered through every backend's `date` runtime
 * helper. Unlike `date-method-uncatalogued` (a refused `toLocaleDateString`),
 * this renders, so it carries oracle data points.
 *
 * The hand-declared points are authored as real `Date` instances (admitted
 * by `assertJsonDomain` now that `Date` is catalogued); the systematic
 * adversarial grid — the epoch, a pre-1970 instant, a leap day, the
 * four-digit-year boundary — is contributed by the type-derived catalogue
 * (`adversarial-catalog.ts`) as `{ $date: ISO }` envelopes. Both are
 * materialized back into a `Date` and compared live against the JS
 * reference render (`data-point-conformance.ts`).
 */
export const fixture = createFixture({
  id: 'date-catalogued',
  description: 'Date-typed prop: toISOString() and getUTCFullYear() render via the catalogued date helper',
  source: `
function DateCatalogued({ createdAt }: { createdAt: Date }) {
  return (
    <div>
      <time>{createdAt.toISOString()}</time>
      <span>{createdAt.getUTCFullYear()}</span>
    </div>
  )
}
export { DateCatalogued }
`,
  props: { createdAt: new Date('2024-01-01T00:00:00.000Z') },
  dataPoints: [
    // A non-midnight instant with a real time-of-day, and a nonzero-ms
    // instant, exercising the millisecond-precision toISOString round-trip.
    // The systematic epoch / pre-1970 / leap-day / year-9999 grid comes
    // from the type-derived catalogue, so it is not repeated here.
    { name: 'midday', props: { createdAt: new Date('2024-06-15T13:45:30.000Z') } },
    { name: 'sub-second', props: { createdAt: new Date('2024-01-01T00:00:00.001Z') } },
  ],
  expectedHtml: `
    <div bf-s="test">
      <time bf="s1"><!--bf:s0-->2024-01-01T00:00:00.000Z<!--/--></time>
      <span bf="s3"><!--bf:s2-->2024<!--/--></span>
    </div>
  `,
})
