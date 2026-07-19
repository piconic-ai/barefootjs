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

  test('unknown timeZone values normalize to UTC (total function)', () => {
    const d = new Date('2024-01-01T23:00:00.000Z')
    expect(formatDate(d, 'YYYY-MM-DD', 'Asia/Tokyo')).toBe('2024-01-01')
    expect(formatDate(d, 'YYYY-MM-DD', 'garbage')).toBe('2024-01-01')
    expect(formatDate(d, 'YYYY-MM-DD', '+9:00')).toBe('2024-01-01')
  })

  test('unparseable or empty date renders the empty string', () => {
    expect(formatDate('not a date', 'YYYY-MM-DD')).toBe('')
    expect(formatDate(new Date(Number.NaN), 'YYYY-MM-DD')).toBe('')
  })
})
