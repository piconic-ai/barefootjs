/**
 * `get` — JS ToPropertyKey and an index read, `recv[key]`
 * (spec/js-primitive-semantics.md, "ToPropertyKey and index read"). An
 * array element is read only through a canonical array index: `1`, `"1"`
 * and `-0` read an element, while `"01"`, `"1e0"`, `"-0"`, `"1.0"`, `1.1`
 * and `-1` are ordinary property names and read `undefined`. A string
 * receiver reads one UTF-16 code unit. An object reads its own key by the
 * key's string.
 */
import type { Domain, PrimitiveCase, PrimitiveOp } from './types'

function getDomain(recv: unknown, key: unknown): Domain {
  if (typeof recv === 'string') return 'string-receiver'
  if (Array.isArray(recv)) {
    return typeof key === 'number' && Number.isInteger(key) && key >= 0 && !Object.is(key, -0)
      ? 'array-index'
      : 'array-key'
  }
  return 'object-key'
}

const c = (recv: unknown, key: unknown, note: string): PrimitiveCase => ({
  fn: 'get',
  args: [recv, key],
  domain: getDomain(recv, key),
  note,
})

const row = [10, 20, 30]

export const get: PrimitiveOp = {
  fn: 'get',
  step: 2,
  reference: (recv: Record<string, unknown>, key: string) => recv[key],
  cases: [
    c(row, 0, 'array index 0'),
    c(row, 1, 'array index 1'),
    c(row, 3, 'an index past the end reads undefined'),
    c(['a', 'b'], 1, 'an array of strings'),
    c(row, '1', 'the canonical string key "1" reads element 1'),
    c(row, '01', 'a leading zero is not an array index'),
    c(row, '1e0', 'an exponent spelling is not an array index'),
    c(row, '1.0', 'a fraction spelling is not an array index'),
    c(row, '-0', 'the string "-0" is not an array index'),
    c(row, ' 1', 'a padded key is not an array index'),
    c(row, -0, 'the number -0 converts to "0" and reads element 0'),
    c(row, 1.1, 'a fractional index reads undefined'),
    c(row, -1, 'a negative index reads undefined (no wrap-around)'),
    c(row, null, 'a nil key reads the "null" property'),
    c(row, true, 'a boolean key reads the "true" property'),
    c(row, '9223372036854775808', 'an index key past the 64-bit range reads undefined'),
    c(row, 1e20, 'a number key past the 64-bit range reads undefined'),
    c('abc', 1, 'a string receiver reads one code unit'),
    c('abc', '1', 'a string receiver with a string key'),
    c('abc', 3, 'a string index past the end reads undefined'),
    c('abc', -1, 'a negative string index reads undefined'),
    c('abc', '9223372036854775808', 'a string index key past the 64-bit range reads undefined'),
    c('a😀b', 3, 'a string index counts UTF-16 code units'),
    c('héllo', 1, 'a non-ASCII BMP character'),
    c({ a: 1 }, 'a', 'an object key'),
    c({ a: 1 }, 'b', 'a missing object key reads undefined'),
    c({ id: 'present' }, 'ID', 'an object key matches exactly (no case variant)'),
    c({ '1': 'x' }, 1, 'a number key reads the object key "1"'),
    c({ 'a.b': 2 }, 'a.b', 'a non-identifier object key'),
    c({ null: 'n' }, null, 'a nil key reads the object key "null"'),
  ],
}
