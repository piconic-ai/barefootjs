/**
 * `formatDate` — format a `Date` (or ISO-8601 string) with an explicit pattern
 * and an explicit timezone. The pure-function date formatter of #2324: every
 * input is explicit, so the output is a deterministic function of its
 * arguments — no host locale, no *implicit* host timezone, no ICU/CLDR data.
 * That is what lets the SSR adapters lower a `formatDate(...)` call to their
 * native `format_date` runtime helper (spec/template-helpers.md) with
 * byte-identical output on every backend.
 *
 * ```tsx
 * <time>{formatDate(createdAt, 'YYYY/M/D', '+09:00')}</time>
 * <time>{formatDate(createdAt, 'YYYY/M/D', 'Asia/Tokyo')}</time>
 * <time>{formatDate(createdAt, 'MMMM D, YYYY', 'UTC', names)}</time>
 * ```
 *
 * Numeric tokens (longest-match; any other character passes through
 * literally): `YYYY` (4-digit zero-padded year, `-`-prefixed for negative
 * years), `MM` / `M` (zero-padded / bare month `01`–`12` / `1`–`12`), `DD` /
 * `D` (zero-padded / bare day of month).
 *
 * Name tokens (#2334) read the explicit `names` table — the caller owns the
 * values (per-locale name selection is the i18n layer's or the compiler's
 * job, never this function's): `MMMM` / `MMM` (wide / abbreviated month
 * name), `dddd` / `ddd` (wide / abbreviated weekday name, Sunday-first).
 * `names` is a flat array in fixed layout: `[0..11]` wide months, `[12..23]`
 * abbreviated months, `[24..30]` wide weekdays, `[31..37]` abbreviated
 * weekdays. A name token indexing a missing/short table renders `''` — the
 * same normative zero-value discipline as an unparseable date, byte-identical
 * on every backend.
 *
 * `timeZone` (#2344) is `'UTC'`, a fixed offset `±HH:MM` within ECMA-402's
 * valid range (`'+09:00'`, `'-05:30'` — hours 00–23, minutes 00–59), or a
 * **canonical IANA zone ID** (`'Asia/Tokyo'`) resolved through tzdata at the
 * instant being formatted — DST-aware, historical-transition-aware, at up to
 * seconds precision (pre-standard LMT offsets count). Any other value — an
 * unknown zone, a non-canonical spelling (`'asia/tokyo'`, a link name the
 * host canonicalizes away), an out-of-range offset (`'+25:00'`) — **throws a
 * `RangeError`**, mirroring `Intl`: loud, never a silent fallback to UTC (a
 * silently substituted timezone is the one failure mode this helper must not
 * have — the pre-#2344 total-function normalization is gone). The receiver
 * contract still comes first: an unset or unparseable `date` renders `''`
 * before `timeZone` is ever inspected, on every backend identically.
 */

const OFFSET_RE = /^([+-])([01]\d|2[0-3]):([0-5]\d)$/
const TOKEN_RE = /YYYY|MMMM|MMM|MM|DD|dddd|ddd|M|D/g

/** `names`-table section offsets (spec/template-helpers.md "format_date"). */
const MONTHS_WIDE = 0
const MONTHS_ABBR = 12
const WEEKDAYS_WIDE = 24
const WEEKDAYS_ABBR = 31

/** Probe formatter per named zone — construction is the expensive step. */
const dtfCache = new Map<string, Intl.DateTimeFormat>()

function invalidTimeZone(timeZone: string): RangeError {
  return new RangeError(
    `formatDate: unresolvable timeZone ${JSON.stringify(timeZone)} — expected 'UTC', a fixed ±HH:MM offset, or a canonical IANA zone ID`,
  )
}

/**
 * Resolve a canonical IANA zone ID's UTC offset (in ms, always a whole
 * multiple of 1000 — tz offsets are second-granular) at instant `t`, via the
 * environment's own tzdata as ECMA-402 exposes it. The wall-clock fields the
 * zone formats for `t` are re-encoded as-if-UTC and diffed against `t` — no
 * dependency on `timeZoneName: 'longOffset'` support, and seconds-precision
 * LMT offsets fall out naturally. Non-canonical spellings and link names
 * (anything `resolvedOptions().timeZone` does not echo verbatim) throw: the
 * canonical primary ID is the only spelling every backend's tzdata resolves
 * identically, so the portable contract admits exactly that.
 */
function zoneOffsetMs(timeZone: string, t: number): number {
  let dtf = dtfCache.get(timeZone)
  if (!dtf) {
    try {
      dtf = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        era: 'short',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    } catch {
      throw invalidTimeZone(timeZone)
    }
    if (dtf.resolvedOptions().timeZone !== timeZone) throw invalidTimeZone(timeZone)
    dtfCache.set(timeZone, dtf)
  }
  const field: Record<string, string> = {}
  for (const part of dtf.formatToParts(t)) field[part.type] = part.value
  // era 'BC' marks proleptic years <= 0: ISO year = 1 - displayed year.
  let year = Number(field.year)
  if (field.era && field.era.startsWith('B')) year = 1 - year
  // setUTCFullYear, not Date.UTC — Date.UTC maps years 0..99 to 1900+y.
  const wall = new Date(0)
  wall.setUTCFullYear(year, Number(field.month) - 1, Number(field.day))
  wall.setUTCHours(Number(field.hour), Number(field.minute), Number(field.second), 0)
  return wall.getTime() - Math.floor(t / 1000) * 1000
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function formatDate(
  date: Date | string,
  pattern: string,
  timeZone = 'UTC',
  names: readonly string[] = [],
): string {
  // Explicit nullish guard: `new Date(null)` is epoch 0, not Invalid Date,
  // so without this a nil receiver would format 1970-01-01 instead of the
  // contract's '' (spec/template-helpers.md "format_date", golden vector
  // "nil receiver renders the empty string").
  if (date === null || date === undefined) return ''
  const d = date instanceof Date ? date : new Date(date)
  const t = d.getTime()
  if (Number.isNaN(t)) return ''
  let offsetMs = 0
  if (timeZone !== 'UTC') {
    const m = OFFSET_RE.exec(timeZone)
    offsetMs = m
      ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) * 60_000
      : zoneOffsetMs(timeZone, t)
  }
  // Shift the instant by the offset, then read UTC fields: the shifted UTC
  // clock face IS the local clock face in that zone at that instant.
  const s = new Date(t + offsetMs)
  const year = s.getUTCFullYear()
  const yyyy = (year < 0 ? '-' : '') + String(Math.abs(year)).padStart(4, '0')
  const month = s.getUTCMonth() + 1
  const day = s.getUTCDate()
  const weekday = s.getUTCDay() // 0 = Sunday, matching the table's Sunday-first layout
  const nameAt = (index: number): string => names[index] ?? ''
  return pattern.replace(TOKEN_RE, (token) => {
    switch (token) {
      case 'YYYY':
        return yyyy
      case 'MMMM':
        return nameAt(MONTHS_WIDE + month - 1)
      case 'MMM':
        return nameAt(MONTHS_ABBR + month - 1)
      case 'MM':
        return pad2(month)
      case 'M':
        return String(month)
      case 'DD':
        return pad2(day)
      case 'D':
        return String(day)
      case 'dddd':
        return nameAt(WEEKDAYS_WIDE + weekday)
      case 'ddd':
        return nameAt(WEEKDAYS_ABBR + weekday)
      default:
        return token
    }
  })
}
