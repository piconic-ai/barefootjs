import { describe, expect, test } from 'bun:test'
import { formatDate } from '../src/format-date'

describe('formatDate', () => {
  test('formats a Date with every token', () => {
    const d = new Date('2024-01-05T00:00:00.000Z')
    expect(formatDate(d, 'YYYY/M/D')).toBe('2024/1/5')
    expect(formatDate(d, 'YYYY-MM-DD')).toBe('2024-01-05')
    expect(formatDate(d, 'M/D/YYYY')).toBe('1/5/2024')
    expect(formatDate(d, 'DD.MM.YYYY')).toBe('05.01.2024')
  })

  test('accepts an ISO-8601 string receiver', () => {
    expect(formatDate('2024-02-29T12:00:00.000Z', 'YYYY-MM-DD')).toBe('2024-02-29')
  })

  test('timeZone defaults to UTC', () => {
    expect(formatDate(new Date('2024-06-15T23:30:00.000Z'), 'YYYY-MM-DD')).toBe('2024-06-15')
  })

  test('positive offset crosses the date boundary forward', () => {
    expect(formatDate(new Date('2024-01-01T23:00:00.000Z'), 'YYYY-MM-DD', '+09:00')).toBe(
      '2024-01-02',
    )
  })

  test('negative offset crosses the date boundary backward', () => {
    expect(formatDate(new Date('2024-01-01T01:00:00.000Z'), 'YYYY-MM-DD', '-05:30')).toBe(
      '2023-12-31',
    )
  })

  test('epoch 0 and pre-1970 instants', () => {
    expect(formatDate(new Date(0), 'YYYY-MM-DD', 'UTC')).toBe('1970-01-01')
    expect(formatDate(new Date(-86_400_000), 'YYYY-MM-DD')).toBe('1969-12-31')
  })

  test('year 9999', () => {
    expect(formatDate(new Date('9999-12-31T00:00:00.000Z'), 'YYYY/M/D')).toBe('9999/12/31')
  })

  test('non-token characters pass through literally', () => {
    expect(formatDate(new Date('2024-01-05T00:00:00.000Z'), 'YYYY年M月D日')).toBe('2024年1月5日')
  })

  // #2344: named IANA zones resolve through tzdata at the instant being
  // formatted; unresolvable tz values throw (RangeError, mirroring Intl)
  // instead of the pre-#2344 silent UTC normalization.
  test('canonical IANA zone names resolve (DST-aware)', () => {
    const d = new Date('2024-01-01T23:00:00.000Z')
    expect(formatDate(d, 'YYYY-MM-DD', 'Asia/Tokyo')).toBe('2024-01-02')
    // Summer instant: EDT (-04:00) keeps July 4; the winter offset would
    // render 07-03. Winter instant: EST (-05:00) crosses back to Jan 3.
    expect(formatDate('2024-07-04T04:30:00.000Z', 'YYYY-MM-DD', 'America/New_York')).toBe('2024-07-04')
    expect(formatDate('2024-01-04T04:30:00.000Z', 'YYYY-MM-DD', 'America/New_York')).toBe('2024-01-03')
  })

  test('seconds-precision LMT offsets resolve (pre-standard tzdata history)', () => {
    // Tokyo LMT is +09:18:59 until 1887-12-31T15:00Z; at 14:45Z the LMT
    // shift lands on 1888-01-01 where a flat +09:00 would stay on 12-31.
    expect(formatDate('1887-12-31T14:45:00.000Z', 'YYYY-MM-DD', 'Asia/Tokyo')).toBe('1888-01-01')
  })

  test('a named zone pushes the far-future instant past year 9999', () => {
    expect(formatDate('9999-12-31T23:59:59.999Z', 'YYYY-MM-DD', 'Asia/Tokyo')).toBe('10000-01-01')
  })

  test('unresolvable timeZone values throw a RangeError (#2344, loud not silent)', () => {
    const d = new Date('2024-01-01T23:00:00.000Z')
    expect(() => formatDate(d, 'YYYY-MM-DD', 'garbage')).toThrow(RangeError)
    expect(() => formatDate(d, 'YYYY-MM-DD', 'Asia/Tokyoo')).toThrow(RangeError)
    // Malformed / out-of-range offsets are no longer silently UTC.
    expect(() => formatDate(d, 'YYYY-MM-DD', '+9:00')).toThrow(RangeError)
    expect(() => formatDate(d, 'YYYY-MM-DD', '+25:00')).toThrow(RangeError)
    // Non-canonical spellings are rejected — the canonical primary ID is
    // the only spelling every backend resolves identically.
    expect(() => formatDate(d, 'YYYY-MM-DD', 'asia/tokyo')).toThrow(RangeError)
    // The host-environment alias would be an implicit-environment read.
    expect(() => formatDate(d, 'YYYY-MM-DD', 'Local')).toThrow(RangeError)
    expect(() => formatDate(d, 'YYYY-MM-DD', '')).toThrow(RangeError)
  })

  test('the receiver contract still precedes tz validation', () => {
    // nil / unparseable receivers render '' before tz is inspected — on
    // every backend identically (spec receiver-first discipline).
    expect(formatDate(null as unknown as Date, 'YYYY-MM-DD', 'garbage')).toBe('')
    expect(formatDate('not a date', 'YYYY-MM-DD', 'garbage')).toBe('')
  })

  test('unparseable or empty date renders the empty string', () => {
    expect(formatDate('not a date', 'YYYY-MM-DD')).toBe('')
    expect(formatDate(new Date(Number.NaN), 'YYYY-MM-DD')).toBe('')
  })

  test('nil receiver renders the empty string, not epoch 0', () => {
    // `new Date(null)` is epoch 0 — the explicit guard is what keeps the
    // normative nil → '' contract (and parity with every backend port).
    expect(formatDate(null as unknown as Date, 'YYYY-MM-DD')).toBe('')
    expect(formatDate(undefined as unknown as Date, 'YYYY-MM-DD')).toBe('')
  })

  // #2334 name tokens. Flat table layout: [0..11] wide months, [12..23]
  // abbreviated months, [24..30] wide weekdays (Sunday-first), [31..37]
  // abbreviated weekdays.
  const EN_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
    'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat',
  ]

  test('name tokens read the explicit table (#2334)', () => {
    // 2024-03-05 is a Tuesday.
    const d = new Date('2024-03-05T12:00:00.000Z')
    expect(formatDate(d, 'MMMM D, YYYY', 'UTC', EN_NAMES)).toBe('March 5, 2024')
    expect(formatDate(d, 'ddd, MMM D', 'UTC', EN_NAMES)).toBe('Tue, Mar 5')
    expect(formatDate(d, 'dddd', 'UTC', EN_NAMES)).toBe('Tuesday')
  })

  test('weekday follows the offset-shifted clock face', () => {
    // 23:00Z Tuesday + 09:00 = Wednesday.
    const d = new Date('2024-03-05T23:00:00.000Z')
    expect(formatDate(d, 'dddd', '+09:00', EN_NAMES)).toBe('Wednesday')
    expect(formatDate(d, 'dddd', 'UTC', EN_NAMES)).toBe('Tuesday')
  })

  test('epoch 0 is a Thursday (the mod-7 anchor every backend must match)', () => {
    expect(formatDate(new Date(0), 'dddd', 'UTC', EN_NAMES)).toBe('Thursday')
    // Pre-1970: 1969-07-20 was a Sunday (floor-division check for ports).
    expect(formatDate(new Date('1969-07-20T20:17:40.123Z'), 'ddd', 'UTC', EN_NAMES)).toBe('Sun')
  })

  test('a name token over a missing/short table renders the empty string', () => {
    const d = new Date('2024-03-05T12:00:00.000Z')
    expect(formatDate(d, 'MMMM D', 'UTC')).toBe(' 5')
    expect(formatDate(d, 'dddd', 'UTC', ['only', 'two'])).toBe('')
  })

  test('numeric tokens ignore the table entirely', () => {
    const d = new Date('2024-03-05T12:00:00.000Z')
    expect(formatDate(d, 'YYYY-MM-DD', 'UTC', EN_NAMES)).toBe('2024-03-05')
  })
})
