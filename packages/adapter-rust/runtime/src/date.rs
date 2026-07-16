//! `date(recv, op)` -- zero-arg `Date.prototype` method lowering
//! (spec/template-helpers.md "date", #2274). `recv` is either this
//! runtime's own [`JsValue::Date`] (an epoch-millisecond `i64`) or an
//! ISO-8601 `String` (a template prop may carry either depending on how
//! the host populated it) -- both normalize to a single epoch-ms integer
//! via [`epoch_ms_of`] before dispatch.
//!
//! No `chrono` (or any other date crate) is a dependency of this crate --
//! see the design doc's fixed dependency list, the same constraint
//! `num.rs`'s numeric-string grammar docstring cites for avoiding `regex`.
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
}
