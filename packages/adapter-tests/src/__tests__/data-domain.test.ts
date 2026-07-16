/**
 * Data-domain admission for the catalogued rich type `Date` (#2274).
 *
 * `assertJsonDomain` (exercised through `createFixture`) gates what a data
 * point's props may contain. `Date` is the first host type admitted beyond
 * the JSON domain; a plain-object `{ $date: ISO }` envelope is admitted as
 * the plain object it is (materialized into a `Date` at render time). Any
 * OTHER class instance is still refused loudly at fixture-definition time.
 *
 * The type-derived catalogue emits the adversarial Date grid as `{ $date:
 * ISO }` envelopes so the points survive the committed JSON artifact.
 */

import { describe, test, expect } from 'bun:test'
import { createFixture } from '../types'
import { generateDataPointsForFixture } from '../adversarial-catalog'

const dateSource = `
function DateProbe({ createdAt }: { createdAt: Date }) {
  return <time>{createdAt.toISOString()}</time>
}
export { DateProbe }
`

describe('assertJsonDomain: Date admission (#2274)', () => {
  test('admits a real Date data-point prop', () => {
    expect(() =>
      createFixture({
        id: 'domain-date-ok',
        description: 'real Date is admitted',
        source: dateSource,
        props: { createdAt: new Date('2024-01-01T00:00:00.000Z') },
        dataPoints: [{ name: 'epoch', props: { createdAt: new Date('1970-01-01T00:00:00.000Z') } }],
        expectedHtml: '<time bf-s="test" bf="s1"><!--bf:s0-->x<!--/--></time>',
      }),
    ).not.toThrow()
  })

  test('refuses an Invalid Date (cannot survive toISOString transport)', () => {
    // An Invalid Date is admitted nowhere: the harness transports a Date as
    // `value.toISOString()`, which throws RangeError on a NaN instant, so it
    // is refused at definition time rather than crashing the render legs.
    expect(() =>
      createFixture({
        id: 'domain-date-invalid',
        description: 'Invalid Date is refused',
        source: dateSource,
        props: { createdAt: new Date('2024-01-01T00:00:00.000Z') },
        dataPoints: [{ name: 'invalid', props: { createdAt: new Date('not-a-date') } }],
        expectedHtml: '<time bf-s="test" bf="s1"><!--bf:s0-->x<!--/--></time>',
      }),
    ).toThrow(/Invalid Date/)
  })

  test('admits the { $date: ISO } envelope as the plain object it is', () => {
    expect(() =>
      createFixture({
        id: 'domain-date-envelope',
        description: 'envelope passes as a plain object',
        source: dateSource,
        props: { createdAt: new Date('2024-01-01T00:00:00.000Z') },
        dataPoints: [{ name: 'env', props: { createdAt: { $date: '1970-01-01T00:00:00.000Z' } } }],
        expectedHtml: '<time bf-s="test" bf="s1"><!--bf:s0-->x<!--/--></time>',
      }),
    ).not.toThrow()
  })

  test('refuses a { $date } envelope with an unparseable ISO string', () => {
    // Validated up front so a bad ISO is a deterministic definition-time
    // error, not a RangeError deep in a prop-baker's toISOString().
    expect(() =>
      createFixture({
        id: 'domain-date-bad-envelope',
        description: 'malformed envelope is refused',
        source: dateSource,
        props: { createdAt: new Date('2024-01-01T00:00:00.000Z') },
        dataPoints: [{ name: 'bad', props: { createdAt: { $date: 'not-a-date' } } }],
        expectedHtml: '<time bf-s="test" bf="s1"><!--bf:s0-->x<!--/--></time>',
      }),
    ).toThrow(/\$date.*unparseable ISO/)
  })

  test('still refuses a non-Date class instance', () => {
    expect(() =>
      createFixture({
        id: 'domain-map-refused',
        description: 'a Map is outside the data domain',
        source: dateSource,
        props: { createdAt: new Date('2024-01-01T00:00:00.000Z') },
        dataPoints: [{ name: 'map', props: { createdAt: new Map() as unknown as Date } }],
        expectedHtml: '<time bf-s="test" bf="s1"><!--bf:s0-->x<!--/--></time>',
      }),
    ).toThrow(/Map instance/)
  })
})

describe('adversarial catalogue: Date grid (#2274)', () => {
  const fixture = createFixture({
    id: 'catalog-date-probe',
    description: 'Date catalogue probe',
    source: dateSource,
    props: { createdAt: new Date('2024-01-01T00:00:00.000Z') },
    expectedHtml: '<time bf-s="test" bf="s1"><!--bf:s0-->x<!--/--></time>',
  })
  const byName = new Map(generateDataPointsForFixture(fixture).map(p => [p.name, p.props]))

  test('emits the adversarial instants as { $date: ISO } envelopes', () => {
    expect(byName.get('gen:createdAt:epoch')).toEqual({ createdAt: { $date: '1970-01-01T00:00:00.000Z' } })
    expect(byName.get('gen:createdAt:pre-1970')).toEqual({ createdAt: { $date: '1969-07-20T20:17:40.123Z' } })
    expect(byName.get('gen:createdAt:leap-day')).toEqual({ createdAt: { $date: '2024-02-29T12:00:00.000Z' } })
    expect(byName.get('gen:createdAt:year-9999')).toEqual({ createdAt: { $date: '9999-12-31T23:59:59.999Z' } })
  })

  test('every generated Date point is JSON-clean (round-trips unchanged)', () => {
    for (const [, props] of byName) {
      expect(JSON.parse(JSON.stringify(props))).toEqual(props)
    }
  })
})
