//! Centralized value representation, i64/u64/f64 unification, and
//! JS-number semantics.
//!
//! Port of the numeric primitives scattered across
//! `packages/adapter-jinja/python/barefootjs/runtime.py` (`_format_js_number`,
//! `js_number`, `.mod`, `.floor`/`.ceil`/`.round`, `.to_fixed`) and
//! `packages/adapter-jinja/python/barefootjs/evaluator.py` (`_to_number`,
//! `_format_number`, `_strict_eq`, `_same_value_zero`, JS `/` and `%`
//! special-casing). Both `runtime.rs` and `evaluator.rs` route EVERY
//! number-shaped operation through here so there is exactly one place that
//! understands number unification and exactly one JS-`Number`-to-string
//! formatter.
//!
//! ## `JsValue`: why not bare `serde_json::Value`
//!
//! The design contract describes the evaluator as operating "over
//! `serde_json::Value`". That is true at the JSON boundary (ParsedExpr
//! trees parsed from JSON, `bf-render`'s payload vars, `encode_json`'s
//! output) but CANNOT be literal for values flowing *through* evaluation:
//! `serde_json::Value::Number` is structurally incapable of holding NaN or
//! +/-Infinity (`serde_json::Number::from_f64` returns `None` for
//! non-finite input, and `Value::from(f64::NAN)` silently becomes
//! `Value::Null` -- JSON has no non-finite numeric literal, by design).
//! Python's port has no such gap (`float('nan')` is a first-class Python
//! value that flows through dict/list/env storage unchanged), and the
//! golden vectors require the SAME fidelity: a division by zero, a failed
//! `Number("nan")` coercion, or `Infinity - Infinity` inside a `fold`/`sort`
//! body must survive as a real NaN/Infinity through env storage, array
//! construction, and comparison -- not collapse to `null` mid-expression.
//!
//! `JsValue` closes that gap: it is a `serde_json::Value`-shaped enum whose
//! `Number` variant is a bare `f64` (so it can hold NaN/Infinity natively),
//! used as the ONE internal working value type for both `evaluator.rs` and
//! `runtime.rs`. It converts losslessly to/from `serde_json::Value` on the
//! way IN (JSON can't spell non-finite literals, so there's nothing to
//! lose) and lossily (non-finite -> `null`, recursively) on the way OUT via
//! [`JsValue::to_json`] -- which is exactly `encode_json`'s documented
//! `_prepare_for_json` contract, so that conversion is implemented ONCE,
//! here, and reused by `backend_minijinja::encode_json`.
//!
//! This is flagged as a considered, necessary deviation from the design
//! doc's literal wording, not a scope expansion: no new module was added
//! (this type lives in `num.rs`, the file already chartered to own
//! "ALL i64/u64/f64 unification"), and every other file's shape is
//! unchanged.
//!
//! ## Divergences that VANISH in this backend
//!
//! Two Python-only workarounds disappear here because Rust's `f64` already
//! implements IEEE-754 semantics natively (Python's `float` does NOT:
//! `1.0 / 0.0` raises `ZeroDivisionError`, `math.fmod(x, 0)` raises
//! `ValueError`, `math.floor(nan)` raises `ValueError`):
//!
//!   * JS `/` needs NO manual zero-divisor special-casing (unlike
//!     `evaluator.py`'s `_binary` `"/"` arm) -- plain `l / r` on `f64`
//!     already yields `+Infinity` / `-Infinity` / `NaN` exactly like JS.
//!   * JS `%` needs NO manual zero-divisor special-casing (unlike
//!     `runtime.py`'s `mod` / `evaluator.py`'s `_binary` `"%"` arm) --
//!     Rust's `%` operator on `f64` IS C `fmod` (remainder with the
//!     dividend's sign), and `x % 0.0` is already `NaN` under IEEE-754.
//!   * `Math.floor` / `Math.ceil` / `Math.round` need NO NaN/Infinity guard
//!     (unlike the Python port's `_is_nan`/`_is_inf` checks, needed only
//!     because `math.floor(float('nan'))` raises in Python) -- `f64::floor`
//!     / `f64::ceil` pass NaN/Infinity through unchanged per IEEE-754.
//!
//! See `tests/vector-divergences.json` for where this removes Python-only
//! divergence declarations (`add/beyond the safe-integer edge...`,
//! `div/zero divisor yields Infinity`) -- those two keys simply have no
//! entry in this backend's declaration file.

use serde_json::Value as JsonValue;
use std::collections::BTreeMap;

// ---------------------------------------------------------------------------
// The internal JS-value domain. See the module docstring for why this
// exists instead of using `serde_json::Value` directly for in-flight
// evaluation results.
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq)]
pub enum JsValue {
    Null,
    Bool(bool),
    /// Always `f64` -- JS has exactly one number type, and unlike
    /// `serde_json::Value::Number` this CAN hold NaN / +Infinity /
    /// -Infinity (see module docstring).
    Number(f64),
    String(String),
    Array(Vec<JsValue>),
    /// `BTreeMap` (not insertion-order) is deliberate: nothing in the
    /// ParsedExpr subset or the runtime helper catalogue depends on JS
    /// object key insertion order, and a sorted map gives `encode_json`
    /// (`bf.json` / `bf-p` / `bf-scope`) its "canonical sorted keys"
    /// contract for free, in one place, rather than re-sorting at the
    /// JSON-encoding boundary.
    Object(BTreeMap<String, JsValue>),
}

impl JsValue {
    pub const fn null() -> JsValue {
        JsValue::Null
    }

    pub fn as_str(&self) -> Option<&str> {
        match self {
            JsValue::String(s) => Some(s.as_str()),
            _ => None,
        }
    }

    pub fn as_array(&self) -> Option<&[JsValue]> {
        match self {
            JsValue::Array(a) => Some(a.as_slice()),
            _ => None,
        }
    }

    pub fn as_object(&self) -> Option<&BTreeMap<String, JsValue>> {
        match self {
            JsValue::Object(o) => Some(o),
            _ => None,
        }
    }

    pub fn as_bool(&self) -> Option<bool> {
        match self {
            JsValue::Bool(b) => Some(*b),
            _ => None,
        }
    }

    /// Convert a decoded JSON document into the working value domain.
    /// Lossless: JSON cannot spell a non-finite literal, so there is
    /// nothing to collapse on the way in.
    pub fn from_json(v: &JsonValue) -> JsValue {
        match v {
            JsonValue::Null => JsValue::Null,
            JsonValue::Bool(b) => JsValue::Bool(*b),
            JsonValue::Number(n) => JsValue::Number(n.as_f64().unwrap_or(f64::NAN)),
            JsonValue::String(s) => JsValue::String(s.clone()),
            JsonValue::Array(a) => JsValue::Array(a.iter().map(JsValue::from_json).collect()),
            JsonValue::Object(o) => {
                JsValue::Object(o.iter().map(|(k, v)| (k.clone(), JsValue::from_json(v))).collect())
            }
        }
    }

    /// Convert to a JSON document. Non-finite numbers become `null`,
    /// recursively, at ANY depth -- this IS `encode_json`'s
    /// `_prepare_for_json` contract (see `backend_minijinja::encode_json`,
    /// which calls this and then `serde_json::to_string`).
    pub fn to_json(&self) -> JsonValue {
        match self {
            JsValue::Null => JsonValue::Null,
            JsValue::Bool(b) => JsonValue::Bool(*b),
            JsValue::Number(n) => number_to_json(*n),
            JsValue::String(s) => JsonValue::String(s.clone()),
            JsValue::Array(a) => JsonValue::Array(a.iter().map(JsValue::to_json).collect()),
            JsValue::Object(o) => {
                JsonValue::Object(o.iter().map(|(k, v)| (k.clone(), v.to_json())).collect())
            }
        }
    }
}

/// `f64` -> `serde_json::Value::Number`, matching JS `JSON.stringify`'s
/// integral-number spelling (`42`, never `42.0`) for the common case
/// (whole numbers within `i64`/`u64` range spell as a JSON integer;
/// everything else -- fractional, huge magnitude, or non-finite -- goes
/// through `Number::from_f64`, with non-finite collapsing to `null`).
/// `serde_json::Number::from_f64` alone is NOT sufficient here: it always
/// produces a JSON float token (`42.0`), which is JS-INCORRECT for a whole
/// number (`JSON.stringify(42) === "42"`, not `"42.0"`).
fn number_to_json(n: f64) -> JsonValue {
    // `i64` range covers every practical prop/index/count value; `as i64`
    // is exact here because `fract() == 0.0` already guarantees no
    // fractional bits, and -0.0 casts to plain 0.
    if n.is_finite() && n.fract() == 0.0 && n.abs() < 9_223_372_036_854_775_807.0 {
        return JsonValue::Number(serde_json::Number::from(n as i64));
    }
    match serde_json::Number::from_f64(n) {
        Some(num) => JsonValue::Number(num),
        None => JsonValue::Null, // NaN / +-Infinity
    }
}

impl From<f64> for JsValue {
    fn from(n: f64) -> Self {
        JsValue::Number(n)
    }
}

impl From<bool> for JsValue {
    fn from(b: bool) -> Self {
        JsValue::Bool(b)
    }
}

impl From<String> for JsValue {
    fn from(s: String) -> Self {
        JsValue::String(s)
    }
}

impl From<&str> for JsValue {
    fn from(s: &str) -> Self {
        JsValue::String(s.to_string())
    }
}

impl From<Vec<JsValue>> for JsValue {
    fn from(a: Vec<JsValue>) -> Self {
        JsValue::Array(a)
    }
}

// ---------------------------------------------------------------------------
// Numeric-string grammar (mirrors Python's `looks_like_number` /
// `parse_number_literal`, itself a mirror of Perl's
// `Scalar::Util::looks_like_number`).
//
// Rather than hand-rolling the regex `^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$`
// plus `^[+-]?(inf(inity)?|nan)$` (no `regex` crate is available in this
// crate's dependency set -- see the design doc's fixed dependency list),
// this delegates to `f64::from_str`, whose documented grammar
// (`Sign? ('inf' | 'infinity' | 'nan' | Number)` where `Number` is exactly
// the digit/decimal-point/exponent shape above) is already isomorphic to
// the Python/Perl grammar. `looks_like_number_rust_grammar_matches_python`
// below pins the equivalence against representative cases (including the
// ones the golden vectors exercise) so any future libstd grammar drift is
// caught here rather than as a mysterious golden-vector failure.
// ---------------------------------------------------------------------------

/// Mirror of `evaluator.looks_like_number` / `Scalar::Util::looks_like_number`
/// for a (possibly padded) string.
pub fn looks_like_number(s: &str) -> bool {
    let t = s.trim();
    if t.is_empty() {
        return false;
    }
    t.parse::<f64>().is_ok()
}

/// Parse a string already known to satisfy [`looks_like_number`] into an
/// `f64`. Mirrors `evaluator.parse_number_literal`.
pub fn parse_number_literal(s: &str) -> f64 {
    s.trim().parse::<f64>().unwrap_or(f64::NAN)
}

// ---------------------------------------------------------------------------
// JsValue <-> f64 / kind unification.
// ---------------------------------------------------------------------------

pub fn is_number(v: &JsValue) -> bool {
    matches!(v, JsValue::Number(_))
}

pub fn is_string(v: &JsValue) -> bool {
    matches!(v, JsValue::String(_))
}

pub fn is_bool(v: &JsValue) -> bool {
    matches!(v, JsValue::Bool(_))
}

pub fn is_null(v: &JsValue) -> bool {
    matches!(v, JsValue::Null)
}

/// Extract the numeric value of a `JsValue::Number` as `f64`. Non-number
/// values yield `NaN`.
pub fn to_f64(v: &JsValue) -> f64 {
    match v {
        JsValue::Number(n) => *n,
        _ => f64::NAN,
    }
}

// ---------------------------------------------------------------------------
// JS Number::toString (ECMA-262 7.1.12.1), the "custom formatter" fallback
// and `js_string`'s number branch both route through this. Port of Python's
// `_format_js_number` / `_format_number`, made exponent-notation-correct
// (Rust's `f64::Display`/`ToString` NEVER emits exponential notation, no
// matter how large or small the magnitude -- the documented trap this
// module exists to close; Python's `repr(float)` fallback carries the same
// unresolved-divergence caveat for extreme magnitudes, which this port
// removes instead of carrying forward).
//
// Algorithm: obtain the shortest round-trip significant-digit string via
// `{:e}` (Rust's `LowerExp`, backed by the same shortest-round-trip
// decimal-conversion core as `Display`, just normalized to `d.ddddEe`
// form), then apply the ECMA-262 placement rules verbatim.
// ---------------------------------------------------------------------------

pub fn format_js_number(n: f64) -> String {
    if n.is_nan() {
        return "NaN".to_string();
    }
    if n.is_infinite() {
        return if n > 0.0 { "Infinity".to_string() } else { "-Infinity".to_string() };
    }
    if n == 0.0 {
        // Normalizes -0.0 to JS's "0" spelling (String(-0) === "0").
        return "0".to_string();
    }
    if n < 0.0 {
        return format!("-{}", format_js_number(-n));
    }

    // n is finite, positive, nonzero. `digits` is the shortest round-trip
    // significant-digit string (k digits, no trailing zeros, first digit
    // nonzero); `n_exp` is the ECMA-262 exponent such that
    // `n == (digits as integer) * 10^(n_exp - k)`.
    let (digits, n_exp) = shortest_digits(n);
    let k = digits.len() as i32;

    if k <= n_exp && n_exp <= 21 {
        // Integer-valued spelling, zero-padded on the right.
        let mut s = digits;
        s.push_str(&"0".repeat((n_exp - k) as usize));
        s
    } else if 0 < n_exp && n_exp <= 21 {
        // Decimal point lands inside the digit string.
        format!("{}.{}", &digits[..n_exp as usize], &digits[n_exp as usize..])
    } else if -6 < n_exp && n_exp <= 0 {
        // Leading "0." plus zero-padding before the digits.
        format!("0.{}{}", "0".repeat((-n_exp) as usize), digits)
    } else {
        // Exponential notation: d(.ddd)?e[+-]N.
        let exp = n_exp - 1;
        let mantissa = if k == 1 {
            digits
        } else {
            format!("{}.{}", &digits[..1], &digits[1..])
        };
        let sign = if exp >= 0 { "+" } else { "-" };
        format!("{}e{}{}", mantissa, sign, exp.abs())
    }
}

/// Returns (shortest round-trip significant digits, ECMA-262 `n` exponent)
/// for a finite, positive, nonzero `f64`.
fn shortest_digits(n: f64) -> (String, i32) {
    // Rust's `{:e}` always normalizes to exactly one digit before the
    // decimal point ("d" or "d.ddd") using the shortest round-trip decimal
    // expansion, e.g. `1e2`, `1.23456e2`, `3.0000000000000004e-1`.
    let s = format!("{:e}", n);
    let (mantissa, exp_str) = s.split_once('e').expect("LowerExp always emits 'e'");
    let exp: i32 = exp_str.parse().expect("LowerExp exponent is a plain integer");
    let digits: String = mantissa.chars().filter(|c| *c != '.').collect();
    // value == d.ddd * 10^exp == (digits as integer) * 10^(exp - (k - 1))
    // ECMA form: value == (digits as integer) * 10^(n_exp - k)
    // => n_exp - k == exp - (k - 1) => n_exp == exp + 1
    (digits, exp + 1)
}

// ---------------------------------------------------------------------------
// Math.floor / Math.ceil / Math.round -- no NaN/Infinity guard needed (see
// module docstring): `f64::floor`/`f64::ceil` already pass them through.
// `Math.round` rounds half toward +Infinity (`Math.round(-1.5) === -1`, NOT
// -2), matching `runtime.py`'s `round` / `evaluator.py`'s `_math_round`.
// ---------------------------------------------------------------------------

pub fn js_floor(n: f64) -> f64 {
    n.floor()
}

pub fn js_ceil(n: f64) -> f64 {
    n.ceil()
}

pub fn js_round(n: f64) -> f64 {
    (n + 0.5).floor()
}

/// JS `%`: remainder with the dividend's sign. Rust's `%` on `f64` already
/// implements C `fmod` semantics (IEEE-754 remainder), so this is a
/// documentation-only wrapper -- see the module docstring for why no
/// zero-divisor special-casing (needed in the Python port) is needed here.
pub fn js_mod(a: f64, b: f64) -> f64 {
    a % b
}

/// JS `Number.prototype.toFixed(digits)`. Mirrors `runtime.py.to_fixed` /
/// `bf.go`'s `ToFixed`: JS rounds the scaled value half toward +Infinity
/// (`(2.5).toFixed(0) === "3"`), not Rust's `format!`'s round-half-to-even,
/// so the value is pre-rounded via [`js_round`]-equivalent scaling before
/// formatting.
pub fn to_fixed(n: f64, digits: i32) -> String {
    if n.is_nan() {
        return "NaN".to_string();
    }
    if n.is_infinite() {
        return if n < 0.0 { "-Infinity".to_string() } else { "Infinity".to_string() };
    }
    let digits = digits.max(0);
    let factor = 10f64.powi(digits);
    let rounded = (n * factor + 0.5).floor();
    format!("{:.*}", digits as usize, rounded / factor)
}

// ---------------------------------------------------------------------------
// JS strict equality (`===`) and SameValueZero (`Array.prototype.includes`
// membership), kind-aware (a JS number never `===` a JS string, even when
// they "look like" the same value: `2 === "2"` is false). Port of
// `evaluator._strict_eq` / `evaluator._same_value_zero`; ALSO used by
// `runtime.rs`'s `index_of` / `last_index_of` (in place of the Python
// port's native `==`, which the Python module docstring documents as
// "mostly" JS-strict-equality-equivalent but with an acknowledged,
// unexercised gap: Python `bool` is an `int` subclass, so `True == 1`,
// which JS `true === 1` is not). Routing `index_of`/`last_index_of` through
// this kind-aware `strict_eq` closes that gap entirely rather than
// reproducing it -- documented in `runtime.rs`.
// ---------------------------------------------------------------------------

pub fn strict_eq(l: &JsValue, r: &JsValue) -> bool {
    let (ln, rn) = (is_number(l), is_number(r));
    if ln && rn {
        let (lf, rf) = (to_f64(l), to_f64(r));
        if lf.is_nan() || rf.is_nan() {
            return false;
        }
        return lf == rf;
    }
    if ln != rn {
        return false;
    }
    match (l, r) {
        (JsValue::Null, JsValue::Null) => true,
        (JsValue::Null, _) | (_, JsValue::Null) => false,
        (JsValue::Bool(a), JsValue::Bool(b)) => a == b,
        (JsValue::Bool(_), _) | (_, JsValue::Bool(_)) => false,
        (JsValue::String(a), JsValue::String(b)) => a == b,
        _ => false,
    }
}

/// SameValueZero: `===` except `NaN` equals itself (and +0/-0 are not
/// distinguished, which this domain doesn't track separately either).
pub fn same_value_zero(l: &JsValue, r: &JsValue) -> bool {
    if is_number(l) && is_number(r) {
        let (lf, rf) = (to_f64(l), to_f64(r));
        if lf.is_nan() && rf.is_nan() {
            return true;
        }
    }
    strict_eq(l, r)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[allow(clippy::approx_constant)] // literal test data ported from Python, not an approximation of pi
    fn format_js_number_matches_ecma262() {
        assert_eq!(format_js_number(0.0), "0");
        assert_eq!(format_js_number(-0.0), "0");
        assert_eq!(format_js_number(f64::NAN), "NaN");
        assert_eq!(format_js_number(f64::INFINITY), "Infinity");
        assert_eq!(format_js_number(f64::NEG_INFINITY), "-Infinity");
        assert_eq!(format_js_number(42.0), "42");
        assert_eq!(format_js_number(-7.0), "-7");
        assert_eq!(format_js_number(3.14), "3.14");
        assert_eq!(format_js_number(0.5), "0.5");
        assert_eq!(format_js_number(1.0), "1");
        assert_eq!(format_js_number(0.30000000000000004), "0.30000000000000004");
        assert_eq!(format_js_number(9007199254740992.0), "9007199254740992");
        assert_eq!(format_js_number(1e20), "100000000000000000000");
        assert_eq!(format_js_number(1e21), "1e+21");
        assert_eq!(format_js_number(123456789012345680000.0), "123456789012345680000");
        assert_eq!(format_js_number(1.5e21), "1.5e+21");
        assert_eq!(format_js_number(0.0001), "0.0001");
        assert_eq!(format_js_number(0.000001), "0.000001");
        assert_eq!(format_js_number(0.0000001), "1e-7");
        assert_eq!(format_js_number(-0.0000001), "-1e-7");
        assert_eq!(format_js_number(100.0), "100");
    }

    #[test]
    fn looks_like_number_rust_grammar_matches_python() {
        for s in ["42", "3.14", "-0.5", "1e3", "1E3", "+5", ".5", "5.", " 8 ", "NaN", "nan", "Infinity", "-inf"] {
            assert!(looks_like_number(s), "expected {s:?} to look like a number");
        }
        for s in ["", "  ", "not a num", "1,000", "5e", "abc", "1_000", "0x1"] {
            assert!(!looks_like_number(s), "expected {s:?} to NOT look like a number");
        }
    }

    #[test]
    fn parse_number_literal_trims_and_parses() {
        assert_eq!(parse_number_literal(" 8 "), 8.0);
        assert_eq!(parse_number_literal("1e3"), 1000.0);
        assert_eq!(parse_number_literal("-0.5"), -0.5);
        assert!(parse_number_literal("nan").is_nan());
    }

    #[test]
    fn js_round_half_toward_positive_infinity() {
        assert_eq!(js_round(3.5), 4.0);
        assert_eq!(js_round(3.4), 3.0);
        assert_eq!(js_round(-1.5), -1.0);
        assert_eq!(js_round(-1.6), -2.0);
    }

    #[test]
    fn js_mod_matches_js_percent() {
        assert_eq!(js_mod(5.0, 3.0), 2.0);
        assert_eq!(js_mod(-5.0, 3.0), -2.0);
        assert!(js_mod(5.0, 0.0).is_nan());
    }

    #[test]
    #[allow(clippy::approx_constant)] // literal test data ported from Python, not an approximation of pi
    fn to_fixed_rounds_half_up_and_handles_nonfinite() {
        assert_eq!(to_fixed(316.0, 2), "316.00");
        assert_eq!(to_fixed(3.14159, 2), "3.14");
        assert_eq!(to_fixed(2.5, 0), "3");
        assert_eq!(to_fixed(1.005, 2), "1.00");
        assert_eq!(to_fixed(f64::NAN, 2), "NaN");
        assert_eq!(to_fixed(f64::INFINITY, 2), "Infinity");
        assert_eq!(to_fixed(f64::NEG_INFINITY, 2), "-Infinity");
    }

    #[test]
    fn strict_eq_is_kind_aware() {
        assert!(strict_eq(&JsValue::Number(2.0), &JsValue::Number(2.0)));
        assert!(!strict_eq(&JsValue::Number(2.0), &JsValue::String("2".into())));
        assert!(!strict_eq(&JsValue::Bool(true), &JsValue::Number(1.0)));
        assert!(!strict_eq(&JsValue::Number(f64::NAN), &JsValue::Number(f64::NAN)));
        assert!(same_value_zero(&JsValue::Number(f64::NAN), &JsValue::Number(f64::NAN)));
        assert!(!same_value_zero(&JsValue::Number(2.0), &JsValue::String("2".into())));
    }

    #[test]
    fn json_round_trip_collapses_non_finite_on_the_way_out_only() {
        let inf = JsValue::Number(f64::INFINITY);
        // Non-finite survives WITHIN the working domain...
        assert!(matches!(inf, JsValue::Number(n) if n.is_infinite()));
        // ...and only collapses to JSON null at the to_json boundary.
        assert_eq!(inf.to_json(), JsonValue::Null);

        let nested = JsValue::Array(vec![JsValue::Number(f64::NAN), JsValue::Number(1.0)]);
        // `1.0` -> JSON `1`, not `1.0` (matches `JSON.stringify`'s
        // integral-number spelling -- see `number_to_json`).
        assert_eq!(nested.to_json(), serde_json::json!([null, 1]));
    }

    #[test]
    fn number_to_json_matches_js_integral_spelling() {
        assert_eq!(serde_json::to_string(&JsValue::Number(42.0).to_json()).unwrap(), "42");
        assert_eq!(serde_json::to_string(&JsValue::Number(-7.0).to_json()).unwrap(), "-7");
        assert_eq!(serde_json::to_string(&JsValue::Number(0.0).to_json()).unwrap(), "0");
        assert_eq!(serde_json::to_string(&JsValue::Number(-0.0).to_json()).unwrap(), "0");
        assert_eq!(serde_json::to_string(&JsValue::Number(1.5).to_json()).unwrap(), "1.5");
        assert_eq!(serde_json::to_string(&JsValue::Number(0.19999999999999998).to_json()).unwrap(), "0.19999999999999998");
    }
}
