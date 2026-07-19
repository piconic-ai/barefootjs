/**
 * `formatDate` — format a `Date` (or ISO-8601 string) with an explicit pattern
 * and an explicit UTC offset. The pure-function date formatter of #2324: every
 * input is explicit, so the output is a deterministic function of its
 * arguments — no host locale, no host timezone, no ICU/CLDR data. That is what
 * lets the SSR adapters lower a `formatDate(...)` call to their native
 * `format_date` runtime helper (spec/template-helpers.md) with byte-identical
 * output on every backend.
 *
 * ```tsx
 * <time>{formatDate(createdAt, 'YYYY/M/D', '+09:00')}</time>
 * ```
 *
 * Pattern tokens (longest-match; any other character passes through
 * literally): `YYYY` (4-digit zero-padded year, `-`-prefixed for negative
 * years), `MM` / `M` (zero-padded / bare month `01`–`12` / `1`–`12`), `DD` /
 * `D` (zero-padded / bare day of month). The v1 token set is date-only and
 * numeric — locale-dependent fields (month names, weekday names) are a
 * deliberate later stage of #2324, and per-locale *pattern selection* belongs
 * to the app's i18n layer, not to this function.
 *
 * `timeZone` is `'UTC'` or a fixed offset `±HH:MM` (`'+09:00'`, `'-05:30'`).
 * The function is total: any other value — including IANA zone names, which
 * would drag host tzdata versions into the output — normalizes to `'UTC'`, so
 * every backend degrades identically instead of diverging. An unset or
 * unparseable `date` renders `''` (the same normative zero-value discipline as
 * the `date` helper, spec/template-helpers.md).
 */

const OFFSET_RE = /^([+-])(\d{2}):(\d{2})$/
const TOKEN_RE = /YYYY|MM|DD|M|D/g

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function formatDate(date: Date | string, pattern: string, timeZone = 'UTC'): string {
  // Explicit nullish guard: `new Date(null)` is epoch 0, not Invalid Date,
  // so without this a nil receiver would format 1970-01-01 instead of the
  // contract's '' (spec/template-helpers.md "format_date", golden vector
  // "nil receiver renders the empty string").
  if (date === null || date === undefined) return ''
  const d = date instanceof Date ? date : new Date(date)
  const t = d.getTime()
  if (Number.isNaN(t)) return ''
  const m = OFFSET_RE.exec(timeZone)
  const offsetMinutes = m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0
  // Shift the instant by the offset, then read UTC fields: the shifted UTC
  // clock face IS the local clock face at that offset.
  const s = new Date(t + offsetMinutes * 60_000)
  const year = s.getUTCFullYear()
  const yyyy = (year < 0 ? '-' : '') + String(Math.abs(year)).padStart(4, '0')
  const month = s.getUTCMonth() + 1
  const day = s.getUTCDate()
  return pattern.replace(TOKEN_RE, (token) => {
    switch (token) {
      case 'YYYY':
        return yyyy
      case 'MM':
        return pad2(month)
      case 'M':
        return String(month)
      case 'DD':
        return pad2(day)
      case 'D':
        return String(day)
      default:
        return token
    }
  })
}
