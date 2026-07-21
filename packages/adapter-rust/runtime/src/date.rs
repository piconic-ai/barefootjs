//! `date(recv, op)` -- zero-arg `Date.prototype` method lowering
//! (spec/template-helpers.md "date", #2274). `recv` is either this
//! runtime's own [`JsValue::Date`] (an epoch-millisecond `i64`) or an
//! ISO-8601 `String` (a template prop may carry either depending on how
//! the host populated it) -- both normalize to a single epoch-ms integer
//! via [`epoch_ms_of`] before dispatch.
//!
//! Calendar arithmetic stays hand-rolled (no date crate on the numeric
//! paths -- the same constraint `num.rs`'s numeric-string grammar
//! docstring cites for avoiding `regex`), with ONE deliberate exception
//! (#2344): named-IANA-zone resolution in `format_date` uses
//! `chrono`/`chrono-tz`, because a timezone database is not something to
//! hand-roll and `chrono-tz` embeds tzdata at a pinned release
//! (deterministic per build, no host tzdata read). Fidelity to the JS
//! reference outranks the zero-dependency stance here.
//! Calendar <-> day-count conversion is Howard Hinnant's `civil_from_days`
//! / `days_from_civil` (public-domain algorithm,
//! <http://howardhinnant.github.io/date_algorithms.html>), correct for the
//! full proleptic-Gregorian range this catalogue's vectors exercise
//! (epoch 0, a pre-1970 instant, a leap day, and a four-digit-year
//! boundary). Every division that must floor (not truncate) toward
//! -Infinity for a negative dividend uses `div_euclid`/`rem_euclid`
//! explicitly rather than plain `/`/`%` (which truncate toward zero in
//! Rust) -- the one correctness trap this port must not reproduce.

use crate::num::JsValue;

const MS_PER_DAY: i64 = 86_400_000;

/// Hinnant `days_from_civil`: (proleptic-Gregorian y/m/d) -> days since the
/// Unix epoch (1970-01-01). `m` is 1-based (January = 1).
fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y.rem_euclid(400); // [0, 399]
    let mp = if m > 2 { m - 3 } else { m + 9 }; // [0, 11], Mar=0 .. Feb=11
    let doy = (153 * mp + 2).div_euclid(5) + d - 1; // [0, 365]
    let doe = yoe * 365 + yoe.div_euclid(4) - yoe.div_euclid(100) + doy; // [0, 146096]
    era * 146_097 + doe - 719_468
}

/// Hinnant `civil_from_days`: days since the Unix epoch -> (y, m, d), `m`
/// 1-based. Inverse of [`days_from_civil`].
fn civil_from_days(z: i64) -> (i64, i64, i64) {
    let z = z + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097); // [0, 146096], always non-negative
    // `doe` (and everything derived from it below) stays within [0,
    // 146096] for the rest of this function, so plain truncating `/`
    // already equals floor division here -- only the two extractions above
    // (on a value that CAN be negative) need `div_euclid`.
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365; // [0, 399]
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
    let mp = (5 * doy + 2) / 153; // [0, 11]
    let d = doy - (153 * mp + 2) / 5 + 1; // [1, 31]
    let m = if mp < 10 { mp + 3 } else { mp - 9 }; // [1, 12]
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d)
}

/// Parse the exact ISO-8601 shape this catalogue's contract uses --
/// `YYYY-MM-DDTHH:MM:SS(.mmm)?Z`, always UTC (a bare `Z`, no numeric
/// offset) -- into epoch milliseconds. This is the one shape every string
/// the golden vectors pass in uses, and the one shape [`format_iso8601`]
/// below ever produces, so a fixed-width positional parse (no `regex`
/// crate in this crate's dependency set) covers the full contract without
/// a general-purpose date-string grammar.
pub fn parse_iso8601(s: &str) -> Option<i64> {
    let b = s.as_bytes();
    let has_ms = match b.len() {
        20 => false,
        24 => true,
        _ => return None,
    };
    if b[4] != b'-' || b[7] != b'-' || b[10] != b'T' || b[13] != b':' || b[16] != b':' {
        return None;
    }
    if has_ms && b[19] != b'.' {
        return None;
    }
    if b[b.len() - 1] != b'Z' {
        return None;
    }
    let year: i64 = s.get(0..4)?.parse().ok()?;
    let month: i64 = s.get(5..7)?.parse().ok()?;
    let day: i64 = s.get(8..10)?.parse().ok()?;
    let hour: i64 = s.get(11..13)?.parse().ok()?;
    let minute: i64 = s.get(14..16)?.parse().ok()?;
    let second: i64 = s.get(17..19)?.parse().ok()?;
    let ms: i64 = if has_ms { s.get(20..23)?.parse().ok()? } else { 0 };
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }
    if hour > 23 || minute > 59 || second > 60 {
        return None;
    }
    let days = days_from_civil(year, month, day);
    Some(days * MS_PER_DAY + hour * 3_600_000 + minute * 60_000 + second * 1000 + ms)
}

/// The inverse of [`parse_iso8601`]: epoch milliseconds -> the exact JS
/// `Date.prototype.toISOString` shape (always millisecond precision,
/// always UTC).
pub fn format_iso8601(ms: i64) -> String {
    let days = ms.div_euclid(MS_PER_DAY);
    let ms_of_day = ms.rem_euclid(MS_PER_DAY); // always [0, 86_399_999]
    let (y, m, d) = civil_from_days(days);
    let hour = ms_of_day / 3_600_000;
    let minute = (ms_of_day / 60_000) % 60;
    let second = (ms_of_day / 1000) % 60;
    let msec = ms_of_day % 1000;
    format!("{y:04}-{m:02}-{d:02}T{hour:02}:{minute:02}:{second:02}.{msec:03}Z")
}

/// Normalize a `date()` receiver to a single epoch-ms integer: this
/// runtime's own [`JsValue::Date`] unwraps directly; an ISO-8601
/// [`JsValue::String`] parses via [`parse_iso8601`]. Anything else (the
/// receiver contract's only two accepted shapes are not met) is `None`,
/// letting [`date`] apply its documented zero-value fallback.
pub fn epoch_ms_of(recv: &JsValue) -> Option<i64> {
    match recv {
        JsValue::Date(ms) => Some(*ms),
        JsValue::String(s) => parse_iso8601(s),
        _ => None,
    }
}

/// Dispatch one of the zero-arg `Date.prototype` ops the compiler's
/// lowering plugin recognizes against an already-normalized epoch-ms
/// instant. Every accessor and `getTime` render as an INTEGER (a whole
/// `f64`, never fractional) -- `civil_from_days`'s inputs/outputs are all
/// exact integers, so no rounding is possible here regardless of how far
/// `ms` sits from the epoch. `getUTCMonth` is 0-based, matching JS (NOT
/// `civil_from_days`'s own 1-based `m`, hence the `- 1`).
pub fn date_op(ms: i64, op: &str) -> JsValue {
    match op {
        "getTime" => return JsValue::Number(ms as f64),
        "toISOString" => return JsValue::String(format_iso8601(ms)),
        _ => {}
    }
    let days = ms.div_euclid(MS_PER_DAY);
    let ms_of_day = ms.rem_euclid(MS_PER_DAY);
    let (y, m, d) = civil_from_days(days);
    match op {
        "getUTCFullYear" => JsValue::Number(y as f64),
        "getUTCMonth" => JsValue::Number((m - 1) as f64),
        "getUTCDate" => JsValue::Number(d as f64),
        "getUTCHours" => JsValue::Number((ms_of_day / 3_600_000) as f64),
        "getUTCMinutes" => JsValue::Number(((ms_of_day / 60_000) % 60) as f64),
        "getUTCSeconds" => JsValue::Number(((ms_of_day / 1000) % 60) as f64),
        _ => JsValue::Number(0.0),
    }
}

/// `date(recv, op)` -- the full helper: normalize `recv` (native
/// [`JsValue::Date`] or ISO-8601 string) then dispatch `op`. An
/// unrecognized receiver shape falls back to `toTime`'s documented
/// zero-value contract (mirrors the Go runtime's `Date`/`toTime` fallback
/// pair): `''` for `toISOString`, `0` for every accessor/`getTime`.
pub fn date(recv: &JsValue, op: &str) -> JsValue {
    match epoch_ms_of(recv) {
        Some(ms) => date_op(ms, op),
        None if op == "toISOString" => JsValue::String(String::new()),
        None => JsValue::Number(0.0),
    }
}

/// Parse a fixed UTC offset `tz` matching `±HH:MM` within ECMA-402's valid
/// range -- hours 00-23, minutes 00-59 -- into signed SECONDS, or `None`
/// for any other shape. Mirrors `OFFSET_RE` in
/// `packages/client/src/format-date.ts` and `tzOffsetRE` in the Go
/// runtime's `bf.go` -- byte/ascii-digit checks here, not a `regex` crate
/// dependency. A `None` falls through to [`zone_offset_seconds`]'s tzdata
/// lookup (#2344): an out-of-range offset like `"+25:00"` is not a zone
/// name either, so it errors there -- matching the JS reference's
/// RangeError, never a silent UTC.
fn parse_tz_offset(tz: &str) -> Option<i64> {
    let b = tz.as_bytes();
    if b.len() != 6 || b[3] != b':' {
        return None;
    }
    let sign = match b[0] {
        b'+' => 1i64,
        b'-' => -1i64,
        _ => return None,
    };
    if !b[1].is_ascii_digit() || !b[2].is_ascii_digit() || !b[4].is_ascii_digit() || !b[5].is_ascii_digit() {
        return None;
    }
    let hh = (b[1] - b'0') as i64 * 10 + (b[2] - b'0') as i64;
    let mm = (b[4] - b'0') as i64 * 10 + (b[5] - b'0') as i64;
    if hh > 23 || mm > 59 {
        return None;
    }
    Some(sign * (hh * 3600 + mm * 60))
}

/// Resolve a canonical IANA zone name's UTC offset (whole seconds) at the
/// epoch-ms instant through `chrono-tz` (#2344) -- tzdata is EMBEDDED in
/// the crate at a pinned release, so resolution is deterministic per build
/// (no host tzdata read), DST-aware and historical-transition-aware at
/// seconds precision (pre-standard LMT offsets like Tokyo's `+09:18:59`
/// count). An unresolvable name errors -- the loud-not-silent replacement
/// for the pre-#2344 normalize-to-UTC total function (the JS reference
/// throws a RangeError there). `chrono-tz` accepts link names as a
/// superset of the canonical IDs; the JS reference throws on those, so
/// that region is unspecified by the spec.
fn zone_offset_seconds(tz: &str, ms: i64) -> Result<i64, String> {
    use chrono::{Offset as _, TimeZone as _};
    let zone: chrono_tz::Tz = tz
        .parse()
        .map_err(|_| format!("format_date: unresolvable timeZone {tz:?}"))?;
    let instant = chrono::DateTime::from_timestamp(ms.div_euclid(1000), 0)
        .ok_or_else(|| format!("format_date: instant out of range for timeZone {tz:?}"))?;
    Ok(i64::from(
        zone.offset_from_utc_datetime(&instant.naive_utc()).fix().local_minus_utc(),
    ))
}

/// `names`-table section offsets (#2334, mirrors `MONTHS_WIDE` /
/// `MONTHS_ABBR` / `WEEKDAYS_WIDE` / `WEEKDAYS_ABBR` in
/// `packages/client/src/format-date.ts` and the Go runtime's `bf.go`
/// `monthsWide` / `monthsAbbr` / `weekdaysWide` / `weekdaysAbbr` constants).
const MONTHS_WIDE: usize = 0;
const MONTHS_ABBR: usize = 12;
const WEEKDAYS_WIDE: usize = 24;
const WEEKDAYS_ABBR: usize = 31;

/// Read one `names` table entry (#2334): `names` is the runtime's own
/// [`JsValue`] array value (whatever array shape `bf.arr`-equivalent
/// template output materializes into -- see [`crate::runtime::mj_to_js`]'s
/// `Seq`/`Iterable` arm, which is what a compiled minijinja template's
/// 4th `format_date` argument becomes by the time it reaches here). A
/// missing/out-of-range index, a non-array `names`, or a non-string
/// element all render `""` -- the same total, zero-value discipline as an
/// unparseable date, mirroring `names[index] ?? ''` in the JS reference
/// (`packages/client/src/format-date.ts`'s `nameAt`) and `formatDateName`
/// in the Go runtime's `bf.go`.
fn name_at(names: &JsValue, index: usize) -> &str {
    match names.as_array().and_then(|arr| arr.get(index)) {
        Some(JsValue::String(s)) => s.as_str(),
        _ => "",
    }
}

/// `format_date(recv, pattern, tz, names)` -- the lowering target for a
/// `formatDate(date, pattern, timeZone, names)` call
/// (spec/template-helpers.md "format_date", #2324, #2334): a total,
/// deterministic date-pattern formatter -- no locale, no host timezone, no
/// `SystemTime::now`. Mirrors `packages/client/src/format-date.ts` (the
/// JS-normative reference) and the Go runtime's `FormatDate` byte-for-byte.
///
/// `recv` follows the `date` helper's receiver contract exactly (see
/// [`epoch_ms_of`]): this runtime's own [`JsValue::Date`] or an ISO-8601
/// string, both normalized to a single epoch-ms instant. A `None`
/// (nil/unset or unparseable) receiver renders `""` -- unlike [`date`],
/// there is no accessor/`getTime` numeric fallback here, since
/// `format_date` always returns a string.
///
/// `tz` (#2344) is `"UTC"`, a range-valid fixed offset (via
/// [`parse_tz_offset`]), or a canonical IANA zone name (via
/// [`zone_offset_seconds`]); anything unresolvable is an `Err`, which the
/// minijinja dispatch surfaces as a template error -- loud, never a
/// silent UTC (the receiver contract still precedes tz validation:
/// nil/unparseable renders `Ok("")` first). The instant is shifted by
/// `offset_seconds * 1000` ms and the shifted instant's UTC calendar
/// fields (not the original instant's) are what the pattern tokens read --
/// the shifted UTC clock face IS the local clock face in that zone.
///
/// `names` (#2334) is a flat table in fixed layout: `[0..11]` wide month
/// names, `[12..23]` abbreviated month names, `[24..30]` wide weekday names
/// (Sunday-first), `[31..37]` abbreviated weekday names -- see [`name_at`].
/// The caller owns the values (locale selection is not this function's
/// job); this only indexes the table.
///
/// `pattern` is scanned left-to-right, longest-match, for the token set
/// `YYYY|MMMM|MMM|MM|DD|dddd|ddd|M|D` (checking longer tokens before
/// shorter ones at each position, the same alternation-order discipline the
/// Go/JS ports use); every other character -- including multi-byte ones
/// like 年/月/日 or 月-name table values -- passes through/renders
/// literally. The scan advances by whole characters only (ASCII token
/// matches consume exactly 1/2/4 ASCII bytes; the fallback branch consumes
/// one full `char` via `len_utf8`), so slicing never lands mid-codepoint.
/// `YYYY` is `abs(year)` zero-padded to 4 digits, `-`-prefixed for a
/// negative year; `MM`/`DD` zero-pad to 2; `M`/`D` are bare. `MMMM`/`MMM`
/// read `names[month-1]` / `names[12+month-1]`; `dddd`/`ddd` read
/// `names[24+weekday]` / `names[31+weekday]`, where `weekday` (0 = Sunday)
/// is derived from the shifted epoch day count via
/// `(days + 4).rem_euclid(7)` -- 1970-01-01 (`days == 0`) is a Thursday,
/// and `rem_euclid` (not `%`, which truncates toward zero in Rust) keeps
/// the result in `[0, 6]` for a negative (pre-1970) `days` too.
pub fn format_date(recv: &JsValue, pattern: &str, tz: &str, names: &JsValue) -> Result<String, String> {
    let ms = match epoch_ms_of(recv) {
        Some(ms) => ms,
        None => return Ok(String::new()),
    };
    let offset_seconds = if tz == "UTC" {
        0
    } else if let Some(seconds) = parse_tz_offset(tz) {
        seconds
    } else {
        zone_offset_seconds(tz, ms)?
    };
    let shifted = ms + offset_seconds * 1000;
    let days = shifted.div_euclid(MS_PER_DAY);
    let (year, month, day) = civil_from_days(days);
    let yyyy = if year < 0 { format!("-{:04}", -year) } else { format!("{year:04}") };
    let weekday = (days + 4).rem_euclid(7) as usize; // 0 = Sunday; epoch (days=0) is Thursday

    let mut out = String::with_capacity(pattern.len());
    let mut i = 0;
    while i < pattern.len() {
        let rest = &pattern[i..];
        if rest.starts_with("YYYY") {
            out.push_str(&yyyy);
            i += 4;
        } else if rest.starts_with("MMMM") {
            out.push_str(name_at(names, MONTHS_WIDE + (month - 1) as usize));
            i += 4;
        } else if rest.starts_with("MMM") {
            out.push_str(name_at(names, MONTHS_ABBR + (month - 1) as usize));
            i += 3;
        } else if rest.starts_with("MM") {
            out.push_str(&format!("{month:02}"));
            i += 2;
        } else if rest.starts_with("DD") {
            out.push_str(&format!("{day:02}"));
            i += 2;
        } else if rest.starts_with("dddd") {
            out.push_str(name_at(names, WEEKDAYS_WIDE + weekday));
            i += 4;
        } else if rest.starts_with("ddd") {
            out.push_str(name_at(names, WEEKDAYS_ABBR + weekday));
            i += 3;
        } else if rest.starts_with('M') {
            out.push_str(&month.to_string());
            i += 1;
        } else if rest.starts_with('D') {
            out.push_str(&day.to_string());
            i += 1;
        } else {
            let ch = rest.chars().next().expect("i < pattern.len() guarantees a char remains");
            out.push(ch);
            i += ch.len_utf8();
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_epoch_0() {
        let ms = parse_iso8601("1970-01-01T00:00:00.000Z").unwrap();
        assert_eq!(ms, 0);
        assert_eq!(format_iso8601(ms), "1970-01-01T00:00:00.000Z");
    }

    #[test]
    fn round_trips_pre_1970() {
        let ms = parse_iso8601("1969-07-20T20:17:40.123Z").unwrap();
        assert_eq!(ms, -14_182_939_877);
        assert_eq!(format_iso8601(ms), "1969-07-20T20:17:40.123Z");
    }

    #[test]
    fn round_trips_leap_day() {
        let ms = parse_iso8601("2024-02-29T23:59:59.999Z").unwrap();
        assert_eq!(format_iso8601(ms), "2024-02-29T23:59:59.999Z");
        assert_eq!(date_op(ms, "getUTCMonth"), JsValue::Number(1.0));
        assert_eq!(date_op(ms, "getUTCDate"), JsValue::Number(29.0));
    }

    #[test]
    fn round_trips_far_future() {
        let ms = parse_iso8601("9999-12-31T23:59:59.999Z").unwrap();
        assert_eq!(format_iso8601(ms), "9999-12-31T23:59:59.999Z");
        assert_eq!(date_op(ms, "getUTCFullYear"), JsValue::Number(9999.0));
    }

    // #2344: named IANA zones resolve through chrono-tz's embedded tzdata;
    // anything unresolvable is an Err — the loud-not-silent replacement for
    // the pre-#2344 normalize-to-UTC total function. The resolvable grid is
    // pinned by the golden vectors (tests/helper_vectors.rs); this pins the
    // error side, which is outside the vector domain
    // (spec/template-helpers.md JS-throws rule).
    #[test]
    fn unresolvable_time_zones_error() {
        let recv = JsValue::String("2024-01-01T23:00:00.000Z".to_string());
        let names = JsValue::Null;
        for tz in ["garbage", "Asia/Tokyoo", "+9:00", "+25:00", "asia/tokyo", "Local", ""] {
            assert!(
                format_date(&recv, "YYYY-MM-DD", tz, &names).is_err(),
                "tz {tz:?} must error"
            );
        }
        // The receiver contract precedes tz validation.
        assert_eq!(format_date(&JsValue::Null, "YYYY-MM-DD", "garbage", &names), Ok(String::new()));
        // Named-zone happy path (redundant with the vectors, but keeps this
        // file self-sufficient outside the monorepo checkout).
        assert_eq!(
            format_date(&recv, "YYYY-MM-DD", "Asia/Tokyo", &names),
            Ok("2024-01-02".to_string())
        );
    }
}
