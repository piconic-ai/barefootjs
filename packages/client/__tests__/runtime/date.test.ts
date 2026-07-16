import { describe, test, expect } from 'bun:test'
import { date } from '../../src/runtime/date'

// Pinned against the same instants the golden oracle vectors use
// (`packages/adapter-tests/vectors/cases.ts`, the `date:` reference fn) so
// the client helper stays in byte-for-byte parity with every SSR backend's
// `date()` runtime helper.
const INSTANTS = {
  epoch: '1970-01-01T00:00:00.000Z',
  preEpoch: '1969-07-20T20:17:40.123Z',
  leapDay: '2024-02-29T23:59:59.999Z',
  farFuture: '9999-12-31T23:59:59.999Z',
} as const

const EXPECTED = {
  epoch: {
    getUTCFullYear: 1970, getUTCMonth: 0, getUTCDate: 1,
    getUTCHours: 0, getUTCMinutes: 0, getUTCSeconds: 0,
    getTime: 0, toISOString: '1970-01-01T00:00:00.000Z',
  },
  preEpoch: {
    getUTCFullYear: 1969, getUTCMonth: 6, getUTCDate: 20,
    getUTCHours: 20, getUTCMinutes: 17, getUTCSeconds: 40,
    getTime: new Date('1969-07-20T20:17:40.123Z').getTime(),
    toISOString: '1969-07-20T20:17:40.123Z',
  },
  leapDay: {
    getUTCFullYear: 2024, getUTCMonth: 1, getUTCDate: 29,
    getUTCHours: 23, getUTCMinutes: 59, getUTCSeconds: 59,
    getTime: new Date('2024-02-29T23:59:59.999Z').getTime(),
    toISOString: '2024-02-29T23:59:59.999Z',
  },
  farFuture: {
    getUTCFullYear: 9999, getUTCMonth: 11, getUTCDate: 31,
    getUTCHours: 23, getUTCMinutes: 59, getUTCSeconds: 59,
    getTime: new Date('9999-12-31T23:59:59.999Z').getTime(),
    toISOString: '9999-12-31T23:59:59.999Z',
  },
} as const

describe('date runtime helper', () => {
  for (const [label, iso] of Object.entries(INSTANTS)) {
    const expected = EXPECTED[label as keyof typeof EXPECTED]
    for (const [op, want] of Object.entries(expected)) {
      test(`${label}: ${op} — Date input`, () => {
        expect(date(new Date(iso), op)).toBe(want)
      })
      test(`${label}: ${op} — ISO string input`, () => {
        expect(date(iso, op)).toBe(want)
      })
    }
  }

  describe('nil / malformed receiver fallback', () => {
    test('null receiver: toISOString degrades to empty string', () => {
      expect(date(null, 'toISOString')).toBe('')
    })
    test('null receiver: getTime degrades to 0', () => {
      expect(date(null, 'getTime')).toBe(0)
    })
    test('null receiver: getUTCFullYear degrades to 0', () => {
      expect(date(null, 'getUTCFullYear')).toBe(0)
    })
    test('undefined receiver: toISOString degrades to empty string', () => {
      expect(date(undefined, 'toISOString')).toBe('')
    })
    test('undefined receiver: getTime degrades to 0', () => {
      expect(date(undefined, 'getTime')).toBe(0)
    })
    test('malformed string receiver: toISOString degrades to empty string', () => {
      expect(date('not-a-date', 'toISOString')).toBe('')
    })
    test('malformed string receiver: getTime degrades to 0', () => {
      expect(date('not-a-date', 'getTime')).toBe(0)
    })
    test('malformed string receiver: getUTCFullYear degrades to 0', () => {
      expect(date('not-a-date', 'getUTCFullYear')).toBe(0)
    })
    test('NaN Date instance: toISOString degrades to empty string', () => {
      expect(date(new Date('not-a-date'), 'toISOString')).toBe('')
    })
    test('NaN Date instance: getTime degrades to 0', () => {
      expect(date(new Date('not-a-date'), 'getTime')).toBe(0)
    })
  })
})
