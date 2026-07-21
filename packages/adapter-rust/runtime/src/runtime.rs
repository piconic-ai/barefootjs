//! Port of `packages/adapter-jinja/python/barefootjs/runtime.py` (itself a
//! port of `packages/adapter-perl/lib/BarefootJS.pm`).
//!
//! Engine- and framework-agnostic server runtime for BarefootJS marked
//! templates. This module is the server-side runtime the marked templates
//! call into at render time as the `bf` object: `{{ bf.scope_attr() }}`,
//! `{{ bf.json(data) }}`, `{{ bf.spread_attrs(bag) }}`. The template-facing
//! `bf` is a [`minijinja::value::Object`] ([`BfInstance`]) whose
//! `call_method` dispatches every snake_case helper below by name --
//! method names are kept VERBATIM from the Python/Perl runtimes since the
//! minijinja adapter's TS emitter generates calls to these exact names.
//!
//! ## Divergences from the Python port (all intentional, documented at the
//! call site below)
//!
//!   * `index_of` / `last_index_of` compare elements with [`num::strict_eq`]
//!     (kind-aware JS `===`) rather than the Python port's native `==`.
//!     Python's module docstring documents native `==` as "mostly"
//!     JS-strict-equality-equivalent but with an acknowledged, unexercised
//!     gap (Python `bool` is an `int` subclass, so `True == 1`, unlike JS
//!     `true === 1`). Routing through `strict_eq` closes that gap entirely
//!     rather than reproducing it -- this is a fidelity IMPROVEMENT, not a
//!     new divergence from JS.
//!   * `register_components_from_manifest` / `_derive_stash_from_defaults`
//!     are NOT ported: they implement Python's alternate manifest-driven
//!     child-registration path, which the `bf-render` conformance binary
//!     does not use (child renderers here are registered directly from the
//!     payload's `children[]` array -- see `bin/bf-render.rs` -- mirroring
//!     `packages/adapter-jinja/src/test-render.ts`'s `buildChildRenderers`,
//!     which seeds `_vars` via a plain `{**_defaults, **child_props}` merge,
//!     not the manifest entry's richer `{value, propName, isRestProps}`
//!     shape). There is no code path in this crate that would ever call
//!     the ported function, so it is omitted rather than carried as dead
//!     code.
//!   * `spread_attrs`'s boolean-attribute detection matches on
//!     [`crate::num::JsValue::Bool`] directly -- Rust's real `enum`, like
//!     Python's real `bool` type, needs no sentinel-ref dance (the
//!     Perl-only concern the Python port's docstring notes).
//!   * `truthy` and `mod` (added in the Python port beyond the Perl
//!     runtime, per the Python-adapter plan) are ported here too, for the
//!     same reason: JS truthiness / JS `%` are needed uniformly by the
//!     minijinja TS emitter's lowering policy for conditions and any `%`
//!     operator it emits.

use crate::backend_minijinja;
use crate::date;
use crate::evaluator;
use crate::num::{self, JsValue};
use minijinja::value::{from_args, Enumerator, Kwargs, Object, ObjectRepr, Value as MjValue, ValueKind};
use minijinja::{Error, ErrorKind, State};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::sync::{Arc, Mutex};

const NULL_JS: JsValue = JsValue::Null;

fn arg(args: &[JsValue], i: usize) -> &JsValue {
    args.get(i).unwrap_or(&NULL_JS)
}

// ---------------------------------------------------------------------------
// Keyword mangling (Python/Jinja adapter plan, "Reserved words" divergence
// policy). `mangle_ident` MUST be kept in lock-step with the TS emitter's
// `packages/adapter-rust/src/adapter/lib/minijinja-naming.ts` `RESERVED_WORDS`
// (itself a copy of `packages/adapter-jinja/src/adapter/lib/jinja-naming.ts`'s
// set -- see the design doc's "RESERVED_WORDS" note: identical set, no
// minijinja-specific re-derivation).
// ---------------------------------------------------------------------------

const RESERVED_WORDS: &[&str] = &[
    "if", "else", "for", "in", "is", "not", "and", "or", "none", "true", "false", "import", "from", "class", "def",
    "pass", "del", "return", "lambda", "global", "with", "as", "raise", "try", "except", "finally", "while", "break",
    "continue", "elif", "yield", "assert", "nonlocal",
];

/// Mangle a JS identifier (prop name, signal getter, loop param, ...) into a
/// minijinja/Jinja-safe variable name: reserved words get a trailing `_`
/// suffix, everything else passes through unchanged. Applied at every point
/// a props dict is turned into template variables (`render_named`,
/// `render_child` prop passing).
pub fn mangle_ident(name: &str) -> String {
    if RESERVED_WORDS.contains(&name) {
        format!("{name}_")
    } else {
        name.to_string()
    }
}

// ---------------------------------------------------------------------------
// JS-equivalent value stringification / coercion -- free functions, reused
// by the array/string helpers below.
// ---------------------------------------------------------------------------

/// JS `String(v)` mirror, with the SAME `null`/`undefined` divergence the
/// Perl/Python runtimes document: [`JsValue::Null`] (JS `null` AND
/// `undefined` -- both collapse to `Null` in this domain, see `num.rs`)
/// renders as the empty string (not `"null"`) so an unset prop doesn't
/// surface as a literal "null"/"undefined" in user-facing HTML. Contrast
/// with `evaluator::to_string`, which is JS-faithful (`null` -> `"null"`)
/// -- see that function's docstring.
pub fn js_string(v: &JsValue) -> String {
    match v {
        JsValue::Null => String::new(),
        JsValue::Bool(b) => if *b { "true" } else { "false" }.to_string(),
        JsValue::Number(n) => num::format_js_number(*n),
        JsValue::String(s) => s.clone(),
        // JS `Array.prototype.toString` == `.join(',')`; never exercised by
        // the golden vectors (they stay scalar-domain) but a reasonable,
        // JS-faithful fallback rather than a Rust `Debug` dump.
        JsValue::Array(items) => items
            .iter()
            .map(|v| if matches!(v, JsValue::Null) { String::new() } else { js_string(v) })
            .collect::<Vec<_>>()
            .join(","),
        JsValue::Object(_) => "[object Object]".to_string(),
        // No JS `Date.prototype.toString()` port (that format -- e.g. "Fri
        // Jul 20 1969 20:17:40 GMT+0000" -- is out of this catalogue's
        // scope, #2274); `toISOString` is the one Date->string shape the
        // spec defines, so a bare `bf.string(date)` uses it too.
        JsValue::Date(ms) => date::format_iso8601(*ms),
    }
}

/// JS `Number(v)` mirror, with the SAME deliberate divergence the Perl/
/// Python runtimes document: `null`/`undefined` and non-numeric strings
/// (INCLUDING the empty string) yield real `NaN` (not 0), so an unset prop
/// / parse failure can't silently zero downstream arithmetic.
pub fn js_number(v: &JsValue) -> f64 {
    match v {
        JsValue::Null => f64::NAN,
        JsValue::Bool(b) => if *b { 1.0 } else { 0.0 },
        JsValue::Number(n) => *n,
        JsValue::String(s) => if num::looks_like_number(s) { num::parse_number_literal(s) } else { f64::NAN },
        JsValue::Array(_) | JsValue::Object(_) => f64::NAN,
        // `Number(date)` mirrors JS `Date`'s default `valueOf` coercion:
        // the epoch-ms count itself.
        JsValue::Date(ms) => *ms as f64,
    }
}

/// JS truthiness: `[]` / `{}` are truthy; only `null`/`undefined`, `false`,
/// `0`, `''`, and `NaN` are falsy.
pub fn js_truthy(v: &JsValue) -> bool {
    match v {
        JsValue::Null => false,
        JsValue::Bool(b) => *b,
        JsValue::Number(n) => !n.is_nan() && *n != 0.0, // not NaN, not zero
        JsValue::String(s) => !s.is_empty(),          // incl. the JS-truthy "0"
        JsValue::Array(_) | JsValue::Object(_) => true,
        JsValue::Date(_) => true, // a JS Date object is always truthy
    }
}

pub fn js_bool_str(v: bool) -> &'static str {
    if v { "true" } else { "false" }
}

/// String receivers arriving as an array/object coerce to `''`; anything
/// else (including `null`) goes through [`js_string`]. Shared by every
/// string-method helper below.
fn scalar_or_empty(v: &JsValue) -> String {
    match v {
        JsValue::Array(_) | JsValue::Object(_) => String::new(),
        other => js_string(other),
    }
}

fn char_len(s: &str) -> usize {
    s.chars().count()
}

// JS `String.prototype.length` counts UTF-16 CODE UNITS, not Rust's
// codepoint-counting `chars().count()` (#2255, used by `char_len` above for
// the char-indexed slice/pad helpers). A codepoint outside the Basic
// Multilingual Plane (astral, U+10000-U+10FFFF — e.g. '👍') is a surrogate
// PAIR in UTF-16, so it counts as 2, not 1; '日本語' is 3 either way
// (BMP-only). Used only by `length` below — `char_len`'s callers need a
// codepoint OFFSET for slicing, not this count.
fn utf16_len(s: &str) -> usize {
    s.chars().map(|c| if c as u32 > 0xFFFF { 2 } else { 1 }).sum()
}

fn char_slice_from(s: &str, n: usize) -> String {
    s.chars().skip(n).collect()
}

fn char_slice_to(s: &str, n: usize) -> String {
    s.chars().take(n).collect()
}

/// `[start, end)` range slice by Unicode scalar value (`char`), not
/// byte offset -- shared by `slice`'s string branch. Matches JS except
/// for astral-plane input, the same divergence boundary `char_len` /
/// `char_slice_from` / `char_slice_to` already accept.
fn char_slice_range(s: &str, start: usize, end: usize) -> String {
    if start >= end {
        return String::new();
    }
    s.chars().skip(start).take(end - start).collect()
}

/// Clamp JS `.slice(start, end?)` bounds against a receiver of
/// `length` elements -- shared by `slice`'s array and string branches
/// below.
fn clamp_slice_range(length: i64, start: &JsValue, end: &JsValue) -> (i64, i64) {
    let mut s = if matches!(start, JsValue::Null) { 0 } else { num::to_f64(start) as i64 };
    if s < 0 {
        s += length;
    }
    s = s.clamp(0, length);
    let mut e = if matches!(end, JsValue::Null) { length } else { num::to_f64(end) as i64 };
    if e < 0 {
        e += length;
    }
    e = e.clamp(0, length);
    (s, e)
}

// ---------------------------------------------------------------------------
// spread_attrs support (JSX intrinsic-element spread, #1407).
// ---------------------------------------------------------------------------

const SVG_CAMEL_CASE_ATTRS: &[&str] = &[
    "allowReorder", "attributeName", "attributeType", "autoReverse", "baseFrequency", "baseProfile", "calcMode",
    "clipPathUnits", "contentScriptType", "contentStyleType", "diffuseConstant", "edgeMode",
    "externalResourcesRequired", "filterRes", "filterUnits", "glyphRef", "gradientTransform", "gradientUnits",
    "kernelMatrix", "kernelUnitLength", "keyPoints", "keySplines", "keyTimes", "lengthAdjust", "limitingConeAngle",
    "markerHeight", "markerUnits", "markerWidth", "maskContentUnits", "maskUnits", "numOctaves", "pathLength",
    "patternContentUnits", "patternTransform", "patternUnits", "pointsAtX", "pointsAtY", "pointsAtZ",
    "preserveAlpha", "preserveAspectRatio", "primitiveUnits", "refX", "refY", "repeatCount", "repeatDur",
    "requiredExtensions", "requiredFeatures", "specularConstant", "specularExponent", "spreadMethod",
    "startOffset", "stdDeviation", "stitchTiles", "surfaceScale", "systemLanguage", "tableValues", "targetX",
    "targetY", "textLength", "viewBox", "viewTarget", "xChannelSelector", "yChannelSelector", "zoomAndPan",
];

fn to_kebab_case(key: &str) -> String {
    let mut out = String::with_capacity(key.len() + 4);
    for c in key.chars() {
        if c.is_ascii_uppercase() {
            out.push('-');
            out.push(c.to_ascii_lowercase());
        } else {
            out.push(c);
        }
    }
    out
}

fn to_attr_name(key: &str) -> String {
    if key == "className" {
        return "class".to_string();
    }
    if key == "htmlFor" {
        return "for".to_string();
    }
    if SVG_CAMEL_CASE_ATTRS.contains(&key) {
        return key.to_string();
    }
    // camelCase -> kebab-case, with a leading `-` for an initial uppercase
    // letter (JS-reference parity, even though that case produces an
    // HTML-invalid attribute name -- same documented behaviour as the Go /
    // Perl adapters' `toAttrName` / `_to_attr_name`).
    to_kebab_case(key)
}

const FORM_SAFE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789*-._ ";

/// `application/x-www-form-urlencoded` serialisation, matching the
/// browser's `URLSearchParams`.
fn form_escape_str(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for &b in s.as_bytes() {
        if FORM_SAFE.contains(&b) {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out.replace(' ', "+")
}

fn form_escape(v: &JsValue) -> String {
    form_escape_str(&js_string(v))
}

/// HTML attribute-value escape for SSR string emission -- covers `&`, `<`,
/// `>`, `"`, `'` using `&#34;` / `&#39;` for quotes (matches Go's
/// `template.HTMLEscapeString` semantics byte-for-byte, so SSR output stays
/// identical across adapters). NOT the same escaper as the custom minijinja
/// formatter's plain-interpolation escaper (`&quot;` for `"`) -- see
/// `backend_minijinja.rs`'s formatter docstring for why the two differ.
fn html_escape(v: &JsValue) -> String {
    escape_html_chars(&js_string(v))
}

fn escape_html_chars(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&#34;").replace('\'', "&#39;")
}

fn style_to_css(v: &JsValue) -> Option<String> {
    match v {
        JsValue::Null => None,
        JsValue::Object(map) => {
            let mut parts = Vec::new();
            for (key, val) in map {
                if matches!(val, JsValue::Null) {
                    continue;
                }
                let prop = to_kebab_case(key);
                parts.push(format!("{prop}:{}", js_string(val)));
            }
            if parts.is_empty() { None } else { Some(parts.join(";")) }
        }
        other => {
            let s = js_string(other);
            if s.is_empty() { None } else { Some(s) }
        }
    }
}

/// Structural scan for characters that could break a value out of a CSS
/// declaration -- ported byte-for-byte from Hono's own `hasUnsafeStyleValue`
/// (`hono/jsx/utils.ts`), the ORACLE this adapter's dynamic `style={{...}}`
/// values must match (#2261). NOT real CSSOM property validation. Every
/// character this scan tests is ASCII, so scanning by byte agrees with
/// Hono's UTF-16-code-unit scan for every input -- a multibyte UTF-8
/// sequence has no byte in the ASCII range, so it can never spuriously
/// match one of these single-byte comparisons.
fn has_unsafe_style_value(value: &str) -> bool {
    let bytes = value.as_bytes();
    let mut quote: u8 = 0;
    let mut block_stack: Vec<u8> = Vec::new();
    let mut i = 0usize;
    while i < bytes.len() {
        let c = bytes[i];
        if c == b'\\' {
            if i == bytes.len() - 1 {
                return true;
            }
            i += 1;
        } else if quote != 0 {
            if c == b'\n' || c == b'\x0c' || c == b'\r' {
                return true;
            }
            if c == quote {
                quote = 0;
            }
        } else if c == b'/' && i + 1 < bytes.len() && bytes[i + 1] == b'*' {
            match value[i + 2..].find("*/") {
                Some(end) => i = i + 2 + end + 1,
                None => return true,
            }
        } else if c == b'"' || c == b'\'' {
            quote = c;
        } else if c == b'(' {
            block_stack.push(b')');
        } else if c == b'[' {
            block_stack.push(b']');
        } else if c == b'{' || c == b'}' {
            return true;
        } else if c == b')' || c == b']' {
            if block_stack.last() != Some(&c) {
                return true;
            }
            block_stack.pop();
        } else if c == b';' && block_stack.is_empty() {
            return true;
        }
        i += 1;
    }
    quote != 0 || !block_stack.is_empty()
}

/// Builds the CSS string for a `style={{...}}` JSX object-literal attribute
/// (#2261). `pairs` alternates CSS key (always compile-time-known), then
/// value. A value that fails `has_unsafe_style_value` (after JS-`String()`-
/// style stringification) is DROPPED -- the whole `key:value` pair is
/// omitted -- matching Hono's oracle exactly. The joined string is STILL
/// HTML-escaped (mirroring Hono's `escapeToBuffer`) since a structurally
/// "safe" value can still carry a literal `"`/`'`/`&`.
fn style_object(pairs: &[JsValue]) -> String {
    let mut parts = Vec::new();
    let mut i = 0;
    while i + 1 < pairs.len() {
        let key = js_string(&pairs[i]);
        let value = js_string(&pairs[i + 1]);
        if !has_unsafe_style_value(&value) {
            parts.push(format!("{}:{}", escape_html_chars(&key), escape_html_chars(&value)));
        }
        i += 2;
    }
    parts.join(";")
}

fn is_on_handler_skip(key: &str) -> bool {
    // Skip when key starts `on` and the third character is its own
    // uppercase form (matches `runtime.py`'s exact predicate, which is
    // broader than the JS-reference `/^on[A-Z]/`: it ALSO swallows digits
    // and `_` because `'0'.upper() == '0'` and `'_'.upper() == '_'` -- see
    // `packages/adapter-jinja/python/tests/test_spread_attrs.py`'s
    // `on0`/`on_custom` cases, which pin this exact behaviour).
    if key.len() <= 2 || &key[0..2] != "on" {
        return false;
    }
    match key[2..].chars().next() {
        Some(c) => c.to_uppercase().collect::<String>() == c.to_string(),
        None => false,
    }
}

pub fn spread_attrs(bag: &JsValue) -> String {
    let map = match bag.as_object() {
        Some(m) => m,
        None => return String::new(),
    };
    let mut parts = Vec::new();
    for (key, val) in map {
        if is_on_handler_skip(key) {
            continue;
        }
        if key == "children" {
            continue;
        }
        if matches!(val, JsValue::Null) {
            continue;
        }
        if let JsValue::Bool(b) = val {
            if *b {
                parts.push(to_attr_name(key));
            }
            continue;
        }
        if key == "style" {
            if let Some(css) = style_to_css(val) {
                parts.push(format!("style=\"{}\"", html_escape(&JsValue::String(css))));
            }
            continue;
        }
        let name = to_attr_name(key);
        parts.push(format!("{name}=\"{}\"", html_escape(val)));
    }
    parts.join(" ")
}

// ---------------------------------------------------------------------------
// sort / reduce structured catalogues (#1448 Tier B/C).
// ---------------------------------------------------------------------------

fn is_numeric_like(v: &JsValue) -> bool {
    match v {
        JsValue::Null | JsValue::Bool(_) => false,
        JsValue::Number(_) => true,
        JsValue::String(s) => num::looks_like_number(s),
        JsValue::Array(_) | JsValue::Object(_) | JsValue::Date(_) => false,
    }
}

fn numeric_value(v: &JsValue) -> f64 {
    match v {
        JsValue::Null | JsValue::Array(_) | JsValue::Object(_) | JsValue::Date(_) => 0.0,
        JsValue::Bool(b) => if *b { 1.0 } else { 0.0 },
        JsValue::Number(n) => *n,
        JsValue::String(s) => if num::looks_like_number(s) { num::parse_number_literal(s) } else { 0.0 },
    }
}

/// Compare two projected sort keys, ascending orientation; the caller
/// reverses for `desc`. `"auto"` compares numerically when both keys look
/// like numbers, else lexically (matches Go/Perl's `bf_sort`). `null`
/// coalesces to `''` / `0` so the order stays total.
fn compare_sort_key(a: &JsValue, b: &JsValue, compare_type: &str) -> std::cmp::Ordering {
    use std::cmp::Ordering;
    let str_of = |v: &JsValue| if matches!(v, JsValue::Null) { String::new() } else { js_string(v) };
    match compare_type {
        "string" => str_of(a).cmp(&str_of(b)),
        "auto" => {
            if is_numeric_like(a) && is_numeric_like(b) {
                numeric_value(a).partial_cmp(&numeric_value(b)).unwrap_or(Ordering::Equal)
            } else {
                str_of(a).cmp(&str_of(b))
            }
        }
        _ => numeric_value(a).partial_cmp(&numeric_value(b)).unwrap_or(Ordering::Equal),
    }
}

struct SortKeySpec {
    key_kind: String,
    key: String,
    compare_type: String,
    direction: String,
}

pub fn sort(recv: &JsValue, opts: &JsValue) -> JsValue {
    let items = match recv.as_array() {
        Some(a) => a,
        None => return JsValue::Array(Vec::new()),
    };
    let keys = opts.as_object().and_then(|m| m.get("keys")).and_then(|v| v.as_array()).unwrap_or(&[]);
    let spec: Vec<SortKeySpec> = keys
        .iter()
        .map(|k| {
            let m = k.as_object();
            SortKeySpec {
                key_kind: m.and_then(|m| m.get("key_kind")).and_then(|v| v.as_str()).unwrap_or("self").to_string(),
                key: m.and_then(|m| m.get("key")).and_then(|v| v.as_str()).unwrap_or("").to_string(),
                compare_type: m.and_then(|m| m.get("compare_type")).and_then(|v| v.as_str()).unwrap_or("numeric").to_string(),
                direction: m.and_then(|m| m.get("direction")).and_then(|v| v.as_str()).unwrap_or("asc").to_string(),
            }
        })
        .collect();
    if spec.is_empty() {
        return JsValue::Array(items.to_vec());
    }

    let project = |item: &JsValue, s: &SortKeySpec| -> JsValue {
        if s.key_kind == "field" {
            item.as_object().and_then(|m| m.get(&s.key)).cloned().unwrap_or(JsValue::Null)
        } else {
            item.clone()
        }
    };

    let mut out = items.to_vec();
    out.sort_by(|a, b| {
        for s in &spec {
            let mut c = compare_sort_key(&project(a, s), &project(b, s), &s.compare_type);
            if s.direction == "desc" {
                c = c.reverse();
            }
            if c != std::cmp::Ordering::Equal {
                return c;
            }
        }
        std::cmp::Ordering::Equal
    });
    JsValue::Array(out)
}

/// Fold via the arithmetic-fold catalogue (#1448 Tier C). Mirrors
/// `Array.prototype.reduce` / `.reduceRight` for the shapes
/// `(acc, x) => acc <op> x` / `(acc, x) => acc <op> x.field`.
pub fn reduce(recv: &JsValue, opts: &JsValue) -> JsValue {
    let om = opts.as_object();
    let op = om.and_then(|m| m.get("op")).and_then(|v| v.as_str()).unwrap_or("+");
    let key_kind = om.and_then(|m| m.get("key_kind")).and_then(|v| v.as_str()).unwrap_or("self");
    let key = om.and_then(|m| m.get("key")).and_then(|v| v.as_str()).unwrap_or("");
    let rtype = om.and_then(|m| m.get("type")).and_then(|v| v.as_str()).unwrap_or("numeric");
    let direction = om.and_then(|m| m.get("direction")).and_then(|v| v.as_str()).unwrap_or("left");

    let mut items: Vec<JsValue> = recv.as_array().map(|a| a.to_vec()).unwrap_or_default();
    if direction == "right" {
        items.reverse();
    }
    let project = |item: &JsValue| -> JsValue {
        if key_kind == "field" {
            item.as_object().and_then(|m| m.get(key)).cloned().unwrap_or(JsValue::Null)
        } else {
            item.clone()
        }
    };

    if rtype == "string" {
        let mut acc = match om.and_then(|m| m.get("init")) {
            Some(JsValue::Null) | None => String::new(),
            Some(other) => js_string(other),
        };
        for item in &items {
            acc.push_str(&js_string(&project(item)));
        }
        return JsValue::String(acc);
    }

    let mut acc: f64 = match om.and_then(|m| m.get("init")) {
        Some(JsValue::Null) | None => 0.0,
        Some(JsValue::Number(n)) => *n,
        Some(other) => js_number(other),
    };
    for item in &items {
        let val = project(item);
        let n = if !matches!(val, JsValue::Null) && is_numeric_like(&val) { numeric_value(&val) } else { 0.0 };
        acc = if op == "*" { acc * n } else { acc + n };
    }
    JsValue::Number(acc)
}

pub fn flat(items: &[JsValue], depth: i64) -> Vec<JsValue> {
    let mut out = Vec::new();
    for el in items {
        if depth != 0 {
            if let JsValue::Array(inner) = el {
                let next = if depth > 0 { depth - 1 } else { depth };
                out.extend(flat(inner, next));
                continue;
            }
        }
        out.push(el.clone());
    }
    out
}

/// `.flat(depth)` where `depth` is a genuinely DYNAMIC runtime value (#2094)
/// -- e.g. a prop, rather than a compile-time literal integer / `Infinity`.
/// Coerces `depth` via JS `ToIntegerOrInfinity` (truncate toward zero;
/// NaN/non-numeric -> 0; -Infinity -> 0; +Infinity or a huge finite value ->
/// flatten fully) and delegates to [`flat`].
///
/// Deliberately a SEPARATE entry point from [`flat`], not a smarter overload
/// of it: `flat`'s `depth` is a compile-time int baked directly into the
/// template source, where `-1` is a SENTINEL meaning "the source literally
/// wrote `Infinity`". A genuinely dynamic depth that happens to evaluate to
/// `-1` at render time means the OPPOSITE in real JS (`[1,[2]].flat(-1)`
/// never recurses -- same as `.flat(0)`). Since both call sites would
/// otherwise hand the SAME literal-looking argument to one shared function,
/// that function could not tell which case it's in -- so it must be two
/// functions. Mirrors Go's `FlatDynamicDepth` / `coerceFlatDepth`
/// (`packages/adapter-go-template/runtime/bf.go`).
pub fn flat_dynamic(items: &[JsValue], depth: &JsValue) -> Vec<JsValue> {
    flat(items, coerce_flat_depth(depth))
}

/// JS `ToIntegerOrInfinity` on a dynamic `.flat(depth)` argument, mapped
/// onto [`flat`]'s int contract (`-1` = flatten fully). Reuses
/// [`crate::evaluator::to_number`] for the `ToNumber` step (already
/// JS-faithful, including string-literal coercion of `"Infinity"` /
/// `"NaN"` via `num::looks_like_number` / `num::parse_number_literal`).
fn coerce_flat_depth(depth: &JsValue) -> i64 {
    let f = evaluator::to_number(depth);
    if f.is_nan() {
        return 0;
    }
    if f.is_infinite() {
        return if f > 0.0 { -1 } else { 0 };
    }
    let trunc = f.trunc();
    if trunc < 0.0 {
        return 0;
    }
    if trunc > 1_000_000.0 {
        return -1;
    }
    trunc as i64
}

pub fn flat_map(recv: &JsValue, key_kind: &str, key: &str) -> JsValue {
    let items = match recv.as_array() {
        Some(a) => a,
        None => return JsValue::Array(Vec::new()),
    };
    let projected: Vec<JsValue> = items
        .iter()
        .map(|el| if key_kind == "field" { el.as_object().and_then(|m| m.get(key)).cloned().unwrap_or(JsValue::Null) } else { el.clone() })
        .collect();
    JsValue::Array(flat(&projected, 1))
}

pub fn flat_map_tuple(recv: &JsValue, specs: &[(String, String)]) -> JsValue {
    let items = match recv.as_array() {
        Some(a) => a,
        None => return JsValue::Array(Vec::new()),
    };
    let mut out = Vec::new();
    for el in items {
        for (kind, key) in specs {
            if kind == "field" {
                out.push(el.as_object().and_then(|m| m.get(key)).cloned().unwrap_or(JsValue::Null));
            } else {
                out.push(el.clone());
            }
        }
    }
    JsValue::Array(out)
}

pub fn array_index_of(recv: &JsValue, elem: &JsValue, reverse: bool) -> i64 {
    let items = match recv.as_array() {
        Some(a) => a,
        None => return -1,
    };
    let idxs: Vec<usize> = if reverse { (0..items.len()).rev().collect() } else { (0..items.len()).collect() };
    for i in idxs {
        let item = &items[i];
        if matches!(item, JsValue::Null) {
            if matches!(elem, JsValue::Null) {
                return i as i64;
            }
            continue;
        }
        if !matches!(elem, JsValue::Null) && num::strict_eq(item, elem) {
            return i as i64;
        }
    }
    -1
}

pub fn pad(s: &str, target: &JsValue, pad_v: &JsValue, at_start: bool) -> String {
    let p = if matches!(pad_v, JsValue::Null) { " ".to_string() } else { js_string(pad_v) };
    if p.is_empty() {
        return s.to_string();
    }
    let length = char_len(s);
    let t = (if matches!(target, JsValue::Null) { 0.0 } else { num::to_f64(target) }) as i64;
    let t = t.max(0) as usize;
    if length >= t {
        return s.to_string();
    }
    let need = t - length;
    let p_len = char_len(&p);
    let reps = need / p_len + 1;
    let fill = char_slice_to(&p.repeat(reps), need);
    if at_start { format!("{fill}{s}") } else { format!("{s}{fill}") }
}

// ---------------------------------------------------------------------------
// Rust-only predicate-taking array helpers (#1448 Tier A). NOT exposed via
// `call_method` -- unlike the structured `sort`/`reduce`/`flat_map`
// catalogues (constructible from a plain dict/string literal in template
// syntax), these take an arbitrary predicate, which neither Jinja2 nor
// minijinja templates can construct (no lambda literal in expression
// position). The compiled adapter routes ALL predicate-driven filtering
// through the `_eval` JSON-string-seam family below instead. These exist
// purely as a reusable Rust API for the golden-vector test harness
// (`tests/helper_vectors.rs`), mirroring `runtime.py`'s `filter`/`every`/
// `some`/`find`/`find_index`/`find_last`/`find_last_index`, which take a
// Python `Callable` for the exact same reason (only reachable from Python
// test code, never from a compiled template).
// ---------------------------------------------------------------------------

pub fn filter(recv: &JsValue, pred: impl Fn(&JsValue) -> bool) -> JsValue {
    match recv.as_array() {
        Some(items) => JsValue::Array(items.iter().filter(|x| pred(x)).cloned().collect()),
        None => JsValue::Array(Vec::new()),
    }
}

pub fn every(recv: &JsValue, pred: impl Fn(&JsValue) -> bool) -> bool {
    match recv.as_array() {
        Some(items) => items.iter().all(pred),
        None => true,
    }
}

pub fn some(recv: &JsValue, pred: impl Fn(&JsValue) -> bool) -> bool {
    match recv.as_array() {
        Some(items) => items.iter().any(pred),
        None => false,
    }
}

pub fn find(recv: &JsValue, pred: impl Fn(&JsValue) -> bool) -> JsValue {
    match recv.as_array() {
        Some(items) => items.iter().find(|x| pred(x)).cloned().unwrap_or(JsValue::Null),
        None => JsValue::Null,
    }
}

pub fn find_index(recv: &JsValue, pred: impl Fn(&JsValue) -> bool) -> i64 {
    match recv.as_array() {
        Some(items) => items.iter().position(pred).map(|i| i as i64).unwrap_or(-1),
        None => -1,
    }
}

pub fn find_last(recv: &JsValue, pred: impl Fn(&JsValue) -> bool) -> JsValue {
    match recv.as_array() {
        Some(items) => items.iter().rev().find(|x| pred(x)).cloned().unwrap_or(JsValue::Null),
        None => JsValue::Null,
    }
}

pub fn find_last_index(recv: &JsValue, pred: impl Fn(&JsValue) -> bool) -> i64 {
    match recv.as_array() {
        Some(items) => {
            for i in (0..items.len()).rev() {
                if pred(&items[i]) {
                    return i as i64;
                }
            }
            -1
        }
        None => -1,
    }
}

// ---------------------------------------------------------------------------
// RenderSession: session-scoped equivalent of Python's module globals
// (`_CONTEXT_STACKS`) plus the mutable per-render registries Perl/Python
// keep as dual-accessor instance state (`_scripts`, `_script_seen`,
// `_child_renderers`). `Arc<Mutex<...>>` per field (not one big mutex) so
// unrelated concerns don't contend; thread-safe for parallel `cargo test`.
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct ChildRendererSpec {
    /// PascalCase component name -- the loop-child scope-id prefix
    /// (`<ComponentName>_<rand6>`) when a child has no `_bf_slot`.
    pub component_name: String,
    /// snake_case `.j2` template base name.
    pub template: String,
    /// Static ssrDefaults values (already flattened to plain values, NOT
    /// the `{value, propName, isRestProps}` wrapper shape -- see the module
    /// docstring's note on why `_derive_stash_from_defaults` isn't ported).
    /// Converted from JSON to `Value` at REGISTRATION time (`bf-render.rs`)
    /// -- see `render_child`'s docstring on why child props stay `Value`
    /// end-to-end rather than round-tripping through `JsValue`.
    pub ssr_defaults: MjValue,
    pub rest_props_name: Option<String>,
    pub param_names: Vec<String>,
}

#[derive(Debug)]
pub struct RenderSession {
    pub scripts: Mutex<Vec<String>>,
    pub script_seen: Mutex<HashSet<String>>,
    pub child_renderers: Mutex<HashMap<String, ChildRendererSpec>>,
    pub context_stacks: Mutex<HashMap<String, Vec<JsValue>>>,
    rng_counter: Mutex<u64>,
}

impl RenderSession {
    pub fn new() -> Arc<RenderSession> {
        Arc::new(RenderSession {
            scripts: Mutex::new(Vec::new()),
            script_seen: Mutex::new(HashSet::new()),
            child_renderers: Mutex::new(HashMap::new()),
            context_stacks: Mutex::new(HashMap::new()),
            rng_counter: Mutex::new(0),
        })
    }

    pub fn register_child_renderer(&self, key: String, spec: ChildRendererSpec) {
        self.child_renderers.lock().unwrap().insert(key, spec);
    }

    /// 6 lowercase hex chars, deterministic-per-session (splitmix64 over an
    /// incrementing counter -- explicitly NOT `std::time`, per the design
    /// doc: loop-child scope ids only need to be locally unique within one
    /// render: `normalizeHTML` canonicalises `<ComponentName>_*` suffixes
    /// away in the conformance fixtures anyway).
    ///
    /// `pub` (beyond `render_child`'s own internal use above) so a
    /// production host can mint the SAME kind of locally-unique suffix for
    /// a request's ROOT scope id (mirrors `packages/adapter-jinja/python/
    /// barefootjs`-based integrations' `rand_suffix()` helper, e.g.
    /// `integrations/flask/app.py`'s `f"{component}_{rand_suffix()}"`) --
    /// see `packages/adapter-rust/runtime/src/manifest.rs` and the axum
    /// integration's route handlers.
    pub fn next_rand_hex6(&self) -> String {
        let mut counter = self.rng_counter.lock().unwrap();
        *counter = counter.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = *counter;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^= z >> 31;
        format!("{:06x}", z & 0xFFFFFF)
    }
}

// ---------------------------------------------------------------------------
// BfInstance: the template-facing `bf` object.
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct BfInstance {
    pub session: Arc<RenderSession>,
    pub scope_id: String,
    pub is_child: bool,
    pub bf_parent: Option<String>,
    pub bf_mount: Option<String>,
    pub props: Option<JsValue>,
    pub data_key: Option<JsValue>,
}

impl BfInstance {
    pub fn root(session: Arc<RenderSession>, scope_id: impl Into<String>) -> BfInstance {
        BfInstance {
            session,
            scope_id: scope_id.into(),
            is_child: false,
            bf_parent: None,
            bf_mount: None,
            props: None,
            data_key: None,
        }
    }

    pub fn as_mj_value(&self) -> MjValue {
        MjValue::from_object(self.clone())
    }

    fn scope_attr(&self) -> String {
        self.scope_id.clone()
    }

    fn hydration_attrs(&self) -> String {
        let mut parts = Vec::new();
        if let Some(host) = &self.bf_parent {
            parts.push(format!("bf-h=\"{}\"", host.replace('"', "&quot;")));
        }
        if let Some(mount) = &self.bf_mount {
            parts.push(format!("bf-m=\"{}\"", mount.replace('"', "&quot;")));
        }
        if !self.is_child {
            parts.push("bf-r=\"\"".to_string());
        }
        parts.join(" ")
    }

    fn data_key_attr(&self) -> String {
        match &self.data_key {
            None => String::new(),
            Some(k) => {
                let k_str = js_string(k).replace('&', "&amp;").replace('"', "&quot;");
                format!(" data-key=\"{k_str}\"")
            }
        }
    }

    fn props_is_empty(&self) -> bool {
        match &self.props {
            None => true,
            Some(p) => p.as_object().map(|m| m.is_empty()).unwrap_or(false),
        }
    }

    fn props_attr(&self) -> String {
        if self.props_is_empty() {
            return String::new();
        }
        // The JSON must be attribute-escaped: a raw `'` inside a string value
        // (e.g. a blog paragraph) terminates the single-quoted attribute and
        // truncates the hydration payload. The browser entity-decodes the
        // attribute value, so the client's JSON.parse sees the original text.
        let j = escape_html_chars(&backend_minijinja::encode_json(self.props.as_ref().unwrap()));
        format!(" bf-p='{j}'")
    }

    fn scope_comment(&self) -> String {
        let mut host_segment = String::new();
        if let Some(host) = &self.bf_parent {
            host_segment = format!("|h={}|m={}", host, self.bf_mount.clone().unwrap_or_default());
        }
        let mut props_json = String::new();
        if !self.props_is_empty() {
            props_json = format!("|{}", backend_minijinja::encode_json(self.props.as_ref().unwrap()));
        }
        format!("<!--bf-scope:{}{host_segment}{props_json}-->", self.scope_id)
    }

    /// Paired end marker for `scope_comment`, emitted after the fragment's
    /// last top-level node. No host/props segments -- the client only needs
    /// the scope id to close the boundary (#2289).
    fn scope_comment_end(&self) -> String {
        format!("<!--bf-/scope:{}-->", self.scope_id)
    }

    fn provide_context(&self, name: &str, value: JsValue) {
        self.session.context_stacks.lock().unwrap().entry(name.to_string()).or_default().push(value);
    }

    fn revoke_context(&self, name: &str) {
        if let Some(stack) = self.session.context_stacks.lock().unwrap().get_mut(name) {
            stack.pop();
        }
    }

    fn use_context(&self, name: &str, default: JsValue) -> JsValue {
        self.session.context_stacks.lock().unwrap().get(name).and_then(|s| s.last()).cloned().unwrap_or(default)
    }

    fn register_script(&self, path: &str) {
        let mut seen = self.session.script_seen.lock().unwrap();
        if seen.contains(path) {
            return;
        }
        seen.insert(path.to_string());
        self.session.scripts.lock().unwrap().push(path.to_string());
    }

    /// `pub` (beyond the `"scripts"` `call_method` dispatch below) so a
    /// production host can read back the accumulated `<script>` tags AFTER
    /// rendering, to splice into its own page layout (mirrors Python
    /// integrations' `bf.scripts()` call in their layout helper, e.g.
    /// `integrations/flask/app.py`'s `layout(..., scripts=bf.scripts())`).
    pub fn scripts(&self) -> String {
        self.session
            .scripts
            .lock()
            .unwrap()
            .iter()
            .map(|p| format!("<script type=\"module\" src=\"{p}\"></script>"))
            .collect::<Vec<_>>()
            .join("\n")
    }

    /// Renderer contract (#1897): invoked from a template as
    /// `bf.render_child(name, {...})` (dict-literal form -- Jinja/minijinja
    /// can't splat a dict into positional/kwargs args) or
    /// `bf.render_child(name)` for a childless invocation. Keyword mangling
    /// happens HERE, before rest-bag routing / `_bf_slot`/`key` popping --
    /// mirrors `runtime.py`'s `render_child` docstring: this is the ONE
    /// place a caller's raw prop keys become template-variable-safe names.
    ///
    /// `props` (and everything derived from it -- the rest bag, the merged
    /// `vars` handed to the child template) stays `minijinja::Value`
    /// end-to-end, all the way through to `render_named_from_state_values`.
    /// This mirrors the Python runtime, where `render_child` passes its
    /// `dict` straight through untouched: a JSX children capture
    /// (`{% set cap %}...{% endset %}`) is a SAFE `Value`, and routing it
    /// through the `JsValue` domain (which has no safe/unsafe distinction)
    /// would silently strip that flag, double-escaping the child's HTML.
    /// The lone exception is `data_key` (`key` prop), converted to
    /// `JsValue` right at the point it's extracted -- `data_key_attr`
    /// genuinely needs `js_string` JS-stringification semantics for a
    /// scalar attribute value, not safe-value semantics.
    pub fn render_child(&self, state: &State, name: &str, props: BTreeMap<String, MjValue>) -> Result<String, Error> {
        let spec = {
            let renderers = self.session.child_renderers.lock().unwrap();
            renderers.get(name).cloned()
        }
        .ok_or_else(|| Error::new(ErrorKind::InvalidOperation, format!("No renderer registered for child component '{name}'")))?;

        let mut map: BTreeMap<String, MjValue> = props.into_iter().map(|(k, v)| (mangle_ident(&k), v)).collect();

        // Rest-bag routing -- mirrors
        // packages/adapter-jinja/src/test-render.ts buildChildRenderers
        // (lines 331-413): a child that destructures a rest bag gets every
        // prop the child didn't explicitly declare routed into it.
        if let Some(rest_name) = &spec.rest_props_name {
            let rest_key = mangle_ident(rest_name);
            let mut keep: HashSet<String> = spec.param_names.iter().map(|p| mangle_ident(p)).collect();
            keep.insert(rest_key.clone());
            keep.insert("children".to_string());
            keep.insert(mangle_ident("key"));
            keep.insert("_bf_slot".to_string());

            let mut rest_bag: BTreeMap<String, MjValue> = match map.remove(&rest_key) {
                Some(v) => mj_map_to_btreemap(&v),
                None => BTreeMap::new(),
            };
            let extra_keys: Vec<String> = map.keys().filter(|k| !keep.contains(*k)).cloned().collect();
            for k in extra_keys {
                if let Some(v) = map.remove(&k) {
                    rest_bag.insert(k, v);
                }
            }
            map.insert(rest_key, MjValue::from(rest_bag));
        }

        let slot_id = map.remove("_bf_slot").and_then(|v| v.as_str().map(str::to_string));
        // JSX `key` (a reserved prop) -> data-key on the child's scope root
        // for keyed-loop reconciliation. `data_key_attr` needs JS
        // stringification semantics (`js_string`), not safe-value
        // semantics, so this is the one deliberate `JsValue` conversion
        // point in this method -- see the docstring above.
        let data_key = map.remove(&mangle_ident("key")).map(|v| mj_to_js(&v));

        let host_scope = self.scope_id.clone();
        let (child_scope_id, bf_parent, bf_mount) = match &slot_id {
            Some(slot) => (format!("{host_scope}_{slot}"), Some(host_scope.clone()), Some(slot.clone())),
            // Loop child (no slot): a fresh `<ComponentName>_<rand6>` id.
            None => (format!("{}_{}", spec.component_name, self.session.next_rand_hex6()), None, None),
        };

        let child = BfInstance {
            session: Arc::clone(&self.session),
            scope_id: child_scope_id,
            is_child: true,
            bf_parent,
            bf_mount,
            props: None,
            data_key,
        };

        // Seed template vars: static ssrDefaults first, caller's props win
        // -- mirrors buildChildRenderers' `_vars = {**_defaults, **child_props}`.
        let mut vars: BTreeMap<String, MjValue> =
            mj_map_to_btreemap(&spec.ssr_defaults).into_iter().map(|(k, v)| (mangle_ident(&k), v)).collect();
        vars.extend(map);

        let rendered = backend_minijinja::render_named_from_state_values(state, &spec.template, child.as_mj_value(), vars)?;
        // chomp: remove at most one trailing newline.
        Ok(rendered.strip_suffix('\n').map(str::to_string).unwrap_or(rendered))
    }
}

// ---------------------------------------------------------------------------
// minijinja::Value <-> JsValue conversion. minijinja 2.x represents EVERY
// sequence/mapping as a `Object` (`ObjectRepr::Seq`/`Map`/`Iterable`) --
// there is no native array/map `ValueRepr` variant to match on -- so this
// goes through the public iteration API (`try_iter` / `get_item`) rather
// than any internal representation.
// ---------------------------------------------------------------------------

pub fn mj_to_js(v: &MjValue) -> JsValue {
    // A `JsDate`-wrapped native Date prop (see that struct's docstring)
    // isn't a Seq/Map/Iterable, so it would otherwise fall into the
    // catch-all `_ => JsValue::Null` below, silently losing the receiver
    // `date()` needs -- checked first, ahead of the generic `v.kind()`
    // dispatch.
    if let Some(d) = v.downcast_object_ref::<JsDate>() {
        return JsValue::Date(d.0);
    }
    match v.kind() {
        ValueKind::Undefined | ValueKind::None => JsValue::Null,
        ValueKind::Bool => JsValue::Bool(v.is_true()),
        // Preserves NaN/Infinity: minijinja's `F64` repr is a bare `f64`
        // with no finiteness constraint (unlike `serde_json::Value`, see
        // the `num` module docstring), and `f64::try_from` doesn't reject
        // non-finite values either.
        ValueKind::Number => JsValue::Number(f64::try_from(v.clone()).unwrap_or(f64::NAN)),
        ValueKind::String => JsValue::String(v.as_str().unwrap_or("").to_string()),
        ValueKind::Seq | ValueKind::Iterable => {
            let mut out = Vec::new();
            if let Ok(iter) = v.try_iter() {
                for item in iter {
                    out.push(mj_to_js(&item));
                }
            }
            JsValue::Array(out)
        }
        ValueKind::Map => {
            let mut out = BTreeMap::new();
            if let Ok(keys) = v.try_iter() {
                for key in keys {
                    if let Some(k) = key.as_str() {
                        if let Ok(val) = v.get_item(&key) {
                            out.insert(k.to_string(), mj_to_js(&val));
                        }
                    }
                }
            }
            JsValue::Object(out)
        }
        // Bytes / Plain / Invalid: never produced by JSON-sourced template
        // vars; not a JS-value shape.
        _ => JsValue::Null,
    }
}

/// Shallow-flatten a minijinja `Map`-kind `Value` into a `BTreeMap` of
/// (still-`Value`) entries, WITHOUT recursing through [`mj_to_js`] --
/// unlike [`mj_to_js`]'s `Map` branch, this keeps every entry's safe flag
/// (and any non-JSON-shaped `Object` value) intact. Used by `render_child`
/// to keep child props as `Value` end-to-end (see its docstring). Any
/// non-`Map`-kind input (e.g. the `None`/`Undefined` a childless/default-
/// less registration decodes to) yields an empty map, matching the
/// pre-port `.as_object().cloned().unwrap_or_default()` fallback.
pub fn mj_map_to_btreemap(v: &MjValue) -> BTreeMap<String, MjValue> {
    let mut out = BTreeMap::new();
    if v.kind() != ValueKind::Map {
        return out;
    }
    if let Ok(keys) = v.try_iter() {
        for key in keys {
            if let Some(k) = key.as_str() {
                if let Ok(val) = v.get_item(&key) {
                    out.insert(k.to_string(), val);
                }
            }
        }
    }
    out
}

pub fn js_to_mj(v: &JsValue) -> MjValue {
    match v {
        JsValue::Null => MjValue::from(()),
        JsValue::Bool(b) => MjValue::from(*b),
        JsValue::Number(n) => MjValue::from(*n),
        JsValue::String(s) => MjValue::from(s.clone()),
        JsValue::Array(a) => MjValue::from(a.iter().map(js_to_mj).collect::<Vec<_>>()),
        JsValue::Object(o) => {
            let map: BTreeMap<String, MjValue> = o.iter().map(|(k, v)| (k.clone(), js_to_mj(v))).collect();
            MjValue::from(map)
        }
        JsValue::Date(ms) => MjValue::from_object(JsDate(*ms)),
    }
}

/// This runtime's own native "Date" value, wrapped as a minijinja
/// `Object` so a host can seed a template var with a real Date-typed
/// receiver instead of always going through `date()`'s ISO-8601-string
/// contract half (spec/template-helpers.md "date", #2274; mirrors the Go
/// runtime's `time.Time` / the Ruby runtime's `Time` as the "native"
/// receiver shape). Carries nothing but the epoch-ms integer
/// `JsValue::Date` already carries -- `mj_to_js`/`js_to_mj` above
/// round-trip it losslessly via `downcast_object_ref`/`from_object`.
#[derive(Debug)]
struct JsDate(i64);

impl Object for JsDate {
    fn repr(self: &Arc<Self>) -> ObjectRepr {
        ObjectRepr::Plain
    }

    // A JS `Date` object is always truthy, like every other object.
    fn is_true(self: &Arc<Self>) -> bool {
        true
    }

    fn render(self: &Arc<Self>, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result
    where
        Self: Sized + 'static,
    {
        // `toISOString` is the one Date->string shape this catalogue
        // defines (see `js_string`'s `JsValue::Date` arm); a bare
        // interpolation of a native Date value uses the same shape.
        write!(f, "{}", date::format_iso8601(self.0))
    }
}

/// Mark a plain string as HTML-structural markup, bypassing the custom
/// formatter's auto-escaping. Every genuinely markup-returning helper
/// below routes through this (mirrors the Python backend's `mark_raw` /
/// the template-side `| safe` filter the TS emitter still ALSO emits at
/// these call sites -- marking safe twice is idempotent, so this holds
/// regardless of whether the emitted template additionally applies
/// `| safe`).
fn safe(s: impl Into<String>) -> MjValue {
    MjValue::from_safe_string(s.into())
}

impl Object for BfInstance {
    fn call_method(self: &Arc<Self>, state: &State<'_, '_>, method: &str, args: &[MjValue]) -> Result<MjValue, Error> {
        // render_child needs special argument handling (dict-literal
        // positional form OR kwargs form -- see its docstring) and access
        // to `state` for re-entrant template rendering, so it's dispatched
        // before the generic per-arg conversion below. Crucially, its props
        // MUST stay `minijinja::Value` end-to-end here (never routed through
        // `mj_to_js`/`JsValue`): a JSX-children capture (`{% set cap %}...
        // {% endset %}`) is a SAFE minijinja Value, and `JsValue` has no
        // safe/unsafe distinction, so converting through it would silently
        // strip the safe flag and cause the child to double-escape its
        // children (verified regression). See `render_child`'s docstring.
        if method == "render_child" {
            let name = args
                .first()
                .and_then(|v| v.as_str())
                .ok_or_else(|| Error::new(ErrorKind::MissingArgument, "render_child requires a name"))?
                .to_string();
            let rest = args.get(1..).unwrap_or(&[]);
            let (positional, kwargs): (&[MjValue], Kwargs) = from_args(rest)?;
            let props: BTreeMap<String, MjValue> = if let Some(first) = positional.first() {
                mj_map_to_btreemap(first)
            } else {
                let keys: Vec<String> = kwargs.args().map(str::to_string).collect();
                let mut map = BTreeMap::new();
                for k in keys {
                    let v: MjValue = kwargs.get(&k)?;
                    map.insert(k, v);
                }
                map
            };
            let html = self.render_child(state, &name, props)?;
            return Ok(safe(html));
        }

        // `bf.string` mirrors the Python runtime's `js_string`: a `str`
        // input is returned AS-IS (a `Markup`/safe input stays safe). Every
        // other helper below intentionally builds a fresh plain `MjValue`
        // (matches Python, where only `js_string` has this passthrough), so
        // this is special-cased here, before the generic per-arg `mj_to_js`
        // conversion would strip the safe flag off a safe string argument.
        if method == "string" {
            if let Some(first) = args.first() {
                if first.is_safe() && first.kind() == ValueKind::String {
                    return Ok(first.clone());
                }
            }
            let js_args: Vec<JsValue> = args.iter().map(mj_to_js).collect();
            return Ok(MjValue::from(js_string(arg(&js_args, 0))));
        }

        let js_args: Vec<JsValue> = args.iter().map(mj_to_js).collect();
        let a = |i: usize| arg(&js_args, i);

        match method {
            // -- Scope & props ------------------------------------------
            "scope_attr" => Ok(MjValue::from(self.scope_attr())),
            "hydration_attrs" => Ok(safe(self.hydration_attrs())),
            "data_key_attr" => Ok(safe(self.data_key_attr())),
            "props_attr" => Ok(safe(self.props_attr())),

            // -- Context --------------------------------------------------
            "provide_context" => {
                self.provide_context(a(0).as_str().unwrap_or(""), a(1).clone());
                Ok(MjValue::from(()))
            }
            "revoke_context" => {
                self.revoke_context(a(0).as_str().unwrap_or(""));
                Ok(MjValue::from(()))
            }
            "use_context" => Ok(js_to_mj(&self.use_context(a(0).as_str().unwrap_or(""), a(1).clone()))),

            // -- Comment markers -------------------------------------------
            "comment" => Ok(safe(format!("<!--bf-{}-->", js_string(a(0))))),
            "bool_str" => Ok(MjValue::from(js_bool_str(js_truthy(a(0))))),
            "text_start" => Ok(safe(format!("<!--bf:{}-->", js_string(a(0))))),
            "text_end" => Ok(safe("<!--/-->".to_string())),
            "scope_comment" => Ok(safe(self.scope_comment())),
            "scope_comment_end" => Ok(safe(self.scope_comment_end())),

            // -- Script registration ---------------------------------------
            "register_script" => {
                self.register_script(a(0).as_str().unwrap_or(""));
                Ok(MjValue::from(()))
            }
            "scripts" => Ok(safe(self.scripts())),

            // -- Streaming SSR ----------------------------------------------
            "streaming_bootstrap" => Ok(safe(STREAMING_BOOTSTRAP.to_string())),
            "async_boundary" => Ok(safe(format!("<div bf-async=\"{}\">{}</div>", js_string(a(0)), js_string(a(1))))),
            "async_resolve" => Ok(safe(format!(
                "<template bf-async-resolve=\"{0}\">{1}</template><script>__bf_swap(\"{0}\")</script>",
                js_string(a(0)),
                js_string(a(1))
            ))),

            // -- JS-compat callees (#1189) -----------------------------------
            // NOTE: "string" is dispatched above (before the generic
            // `js_args` conversion) so a safe input can pass through
            // unchanged -- see that early-return's docstring.
            "json" => Ok(MjValue::from(backend_minijinja::encode_json(a(0)))),
            "number" => Ok(MjValue::from(js_number(a(0)))),
            "truthy" => Ok(MjValue::from(js_truthy(a(0)))),
            "mod" => Ok(MjValue::from(num::js_mod(js_number(a(0)), js_number(a(1))))),
            "floor" => Ok(MjValue::from(num::js_floor(js_number(a(0))))),
            "ceil" => Ok(MjValue::from(num::js_ceil(js_number(a(0))))),
            "round" => Ok(MjValue::from(num::js_round(js_number(a(0))))),
            "min" => Ok(MjValue::from(num::js_min(js_number(a(0)), js_number(a(1))))),
            "max" => Ok(MjValue::from(num::js_max(js_number(a(0)), js_number(a(1))))),
            "abs" => Ok(MjValue::from(num::js_abs(js_number(a(0))))),
            "to_fixed" => Ok(MjValue::from(num::to_fixed(js_number(a(0)), num::to_f64(a(1)) as i32))),
            // `date(recv, op)` -- zero-arg `Date.prototype` method
            // lowering (spec/template-helpers.md "date", #2274). `recv` is
            // either a `JsDate`-wrapped native receiver (already converted
            // to `JsValue::Date` by `mj_to_js` above) or an ISO-8601
            // string; `date::date` normalizes and dispatches both. `op`
            // stays a plain string arg, never routed through `js_number`.
            "date" => Ok(js_to_mj(&date::date(a(0), a(1).as_str().unwrap_or("")))),
            // `format_date(recv, pattern, tz, names)` (spec/template-helpers.md
            // "format_date", #2324, #2334, #2344) -- locale-free date-pattern
            // formatting layered on the same `recv` normalization as
            // `date` above. `names` stays the array-shaped `JsValue` that
            // `mj_to_js`'s `Seq`/`Iterable` arm already produced above (the
            // compiler's lowering always passes 4 args); a non-array or
            // missing `names` degrades to `""` for every name token, per
            // `date::name_at`. An unresolvable tz (#2344) surfaces as a
            // template error -- loud, never a silent UTC. See
            // `date::format_date`'s docstring for the full contract.
            "format_date" => date::format_date(a(0), a(1).as_str().unwrap_or(""), a(2).as_str().unwrap_or(""), a(3))
                .map(MjValue::from)
                .map_err(|msg| Error::new(ErrorKind::InvalidOperation, msg)),

            // -- Array / string method helpers (#1448 Tier A) ------------------
            "includes" => Ok(MjValue::from(includes(a(0), a(1)))),
            "lc" => Ok(MjValue::from(js_string(a(0)).to_lowercase())),
            "uc" => Ok(MjValue::from(js_string(a(0)).to_uppercase())),
            "join" => Ok(MjValue::from(join(a(0), a(1)))),
            "length" => Ok(MjValue::from(length(a(0)))),
            "style_object" => Ok(safe(style_object(&js_args))),
            "index_of" => Ok(MjValue::from(array_index_of(a(0), a(1), false))),
            "last_index_of" => Ok(MjValue::from(array_index_of(a(0), a(1), true))),
            "at" => Ok(js_to_mj(&at(a(0), a(1)))),
            "concat" => Ok(js_to_mj(&concat(a(0), a(1)))),
            "slice" => Ok(js_to_mj(&slice(a(0), a(1), a(2)))),
            // Object-rest residual for a `.map()` destructure binding (#2087
            // Phase B) -- see `omit`'s docstring.
            "omit" => Ok(js_to_mj(&omit(a(0), a(1)))),
            "reverse" => Ok(js_to_mj(&reverse(a(0)))),
            "flat" => {
                let depth = if matches!(a(1), JsValue::Null) { 1 } else { num::to_f64(a(1)) as i64 };
                Ok(js_to_mj(&JsValue::Array(flat(a(0).as_array().unwrap_or(&[]), depth))))
            }
            // Dynamic-depth `.flat(depth)` (#2094) -- `depth` is an arbitrary
            // runtime value (not a compile-time literal), coerced here via
            // JS `ToIntegerOrInfinity`. Deliberately a distinct entry point
            // from "flat" above -- see `flat_dynamic`'s docstring.
            "flat_dynamic" => Ok(js_to_mj(&JsValue::Array(flat_dynamic(a(0).as_array().unwrap_or(&[]), a(1))))),
            "flat_map" => Ok(js_to_mj(&flat_map(a(0), a(1).as_str().unwrap_or(""), a(2).as_str().unwrap_or("")))),
            "flat_map_tuple" => {
                let specs: Vec<(String, String)> = js_args[1..]
                    .chunks(2)
                    .filter(|c| c.len() == 2)
                    .map(|c| (js_string(&c[0]), js_string(&c[1])))
                    .collect();
                Ok(js_to_mj(&flat_map_tuple(a(0), &specs)))
            }
            "trim" => Ok(MjValue::from(trim(a(0)))),
            "trim_start" => Ok(MjValue::from(trim_start(a(0)))),
            "trim_end" => Ok(MjValue::from(trim_end(a(0)))),
            "split" => {
                let sep = if args.len() > 1 { Some(a(1)) } else { None };
                let limit = if args.len() > 2 && !matches!(a(2), JsValue::Null) { Some(num::to_f64(a(2)) as i64) } else { None };
                Ok(js_to_mj(&split(a(0), sep, limit)))
            }
            "starts_with" => Ok(MjValue::from(starts_with(a(0), a(1), a(2)))),
            "ends_with" => Ok(MjValue::from(ends_with(a(0), a(1), a(2)))),
            "replace" => Ok(MjValue::from(replace(a(0), a(1), a(2)))),
            "replace_all" => Ok(MjValue::from(replace_all(a(0), a(1), a(2)))),
            "query" => Ok(MjValue::from(query(a(0), &js_args[1..]))),
            "repeat" => Ok(MjValue::from(repeat(a(0), a(1)))),
            "pad_start" => Ok(MjValue::from(pad(&scalar_or_empty(a(0)), a(1), a(2), true))),
            "pad_end" => Ok(MjValue::from(pad(&scalar_or_empty(a(0)), a(1), a(2), false))),

            // -- Structured comparator / fold catalogues (#1448 Tier B/C) -----
            "sort" => Ok(js_to_mj(&sort(a(0), a(1)))),
            "reduce" => Ok(js_to_mj(&reduce(a(0), a(1)))),

            // -- JSX intrinsic-element spread (#1407) --------------------------
            "spread_attrs" => Ok(safe(spread_attrs(a(0)))),

            // -- Evaluator-driven sort / reduce / higher-order predicates (#2018)
            "sort_eval" => {
                let base_env = eval_base_env(a(4));
                let out = evaluator::sort_by_json(a(0), a(1).as_str().unwrap_or(""), a(2).as_str().unwrap_or(""), a(3).as_str().unwrap_or(""), &base_env)
                    .map_err(eval_json_error)?;
                Ok(js_to_mj(&JsValue::Array(out)))
            }
            "reduce_eval" => {
                let base_env = eval_base_env(a(6));
                let direction = if matches!(a(5), JsValue::Null) { "left".to_string() } else { js_string(a(5)) };
                let out = evaluator::fold_json(a(0), a(1).as_str().unwrap_or(""), a(2).as_str().unwrap_or(""), a(3).as_str().unwrap_or(""), a(4).clone(), &direction, &base_env)
                    .map_err(eval_json_error)?;
                Ok(js_to_mj(&out))
            }
            "filter_eval" => {
                let base_env = eval_base_env(a(3));
                let out = evaluator::filter_json(a(0), a(1).as_str().unwrap_or(""), a(2).as_str().unwrap_or(""), &base_env).map_err(eval_json_error)?;
                Ok(js_to_mj(&JsValue::Array(out)))
            }
            "every_eval" => {
                let base_env = eval_base_env(a(3));
                let out = evaluator::every_json(a(0), a(1).as_str().unwrap_or(""), a(2).as_str().unwrap_or(""), &base_env).map_err(eval_json_error)?;
                Ok(MjValue::from(out))
            }
            "some_eval" => {
                let base_env = eval_base_env(a(3));
                let out = evaluator::some_json(a(0), a(1).as_str().unwrap_or(""), a(2).as_str().unwrap_or(""), &base_env).map_err(eval_json_error)?;
                Ok(MjValue::from(out))
            }
            "find_eval" => {
                let forward = if matches!(a(3), JsValue::Null) { true } else { js_truthy(a(3)) };
                let base_env = eval_base_env(a(4));
                let out = evaluator::find_json(a(0), a(1).as_str().unwrap_or(""), a(2).as_str().unwrap_or(""), forward, &base_env).map_err(eval_json_error)?;
                Ok(js_to_mj(&out))
            }
            "find_index_eval" => {
                let forward = if matches!(a(3), JsValue::Null) { true } else { js_truthy(a(3)) };
                let base_env = eval_base_env(a(4));
                let out = evaluator::find_index_json(a(0), a(1).as_str().unwrap_or(""), a(2).as_str().unwrap_or(""), forward, &base_env).map_err(eval_json_error)?;
                Ok(MjValue::from(out))
            }
            "flat_map_eval" => {
                let base_env = eval_base_env(a(3));
                let out = evaluator::flat_map_json(a(0), a(1).as_str().unwrap_or(""), a(2).as_str().unwrap_or(""), &base_env).map_err(eval_json_error)?;
                Ok(js_to_mj(&JsValue::Array(out)))
            }
            "map_eval" => {
                let base_env = eval_base_env(a(3));
                let out = evaluator::map_json(a(0), a(1).as_str().unwrap_or(""), a(2).as_str().unwrap_or(""), &base_env).map_err(eval_json_error)?;
                Ok(js_to_mj(&JsValue::Array(out)))
            }

            _ => Err(Error::from(ErrorKind::UnknownMethod)),
        }
    }

    fn enumerate(self: &Arc<Self>) -> Enumerator {
        Enumerator::NonEnumerable
    }
}

fn eval_base_env(v: &JsValue) -> evaluator::Env {
    match v.as_object() {
        Some(m) => m.iter().map(|(k, v)| (k.clone(), v.clone())).collect(),
        None => evaluator::Env::new(),
    }
}

fn eval_json_error(e: serde_json::Error) -> Error {
    Error::new(ErrorKind::InvalidOperation, format!("invalid ParsedExpr JSON: {e}"))
}

const STREAMING_BOOTSTRAP: &str = "<script>(function(){function s(id){\
var a=document.querySelector('[bf-async=\"'+id+'\"]');\
var t=document.querySelector('template[bf-async-resolve=\"'+id+'\"]');\
if(!a||!t)return;\
a.replaceChildren(t.content.cloneNode(true));\
a.removeAttribute('bf-async');\
t.remove();\
requestAnimationFrame(function(){if(window.__bf_hydrate)window.__bf_hydrate()})\
};window.__bf_swap=s})()</script>";

// ---------------------------------------------------------------------------
// Array / string helpers (free functions -- no instance state needed,
// mirrors runtime.py's methods, which only use `self` for `self.backend`).
// ---------------------------------------------------------------------------

pub fn includes(recv: &JsValue, elem: &JsValue) -> bool {
    match recv {
        JsValue::Array(items) => items.iter().any(|item| num::same_value_zero(item, elem)),
        JsValue::Object(_) => false,
        other => js_string(other).contains(&js_string(elem)),
    }
}

pub fn join(recv: &JsValue, sep: &JsValue) -> String {
    let items = match recv.as_array() {
        Some(a) => a,
        None => return String::new(),
    };
    let sep_s = if matches!(sep, JsValue::Null) { ",".to_string() } else { js_string(sep) };
    items.iter().map(js_string).collect::<Vec<_>>().join(&sep_s)
}

pub fn length(recv: &JsValue) -> f64 {
    match recv {
        JsValue::Array(a) => a.len() as f64,
        JsValue::Object(_) => 0.0,
        other => utf16_len(&js_string(other)) as f64,
    }
}

pub fn at(recv: &JsValue, i: &JsValue) -> JsValue {
    let items = match recv.as_array() {
        Some(a) => a,
        None => return JsValue::Null,
    };
    if matches!(i, JsValue::Null) {
        return JsValue::Null;
    }
    let length = items.len() as i64;
    if length == 0 {
        return JsValue::Null;
    }
    let idx = num::to_f64(i) as i64;
    let idx = if idx < 0 { length + idx } else { idx };
    if idx < 0 || idx >= length { JsValue::Null } else { items[idx as usize].clone() }
}

pub fn concat(a: &JsValue, b: &JsValue) -> JsValue {
    let mut out = Vec::new();
    if let Some(arr) = a.as_array() {
        out.extend(arr.iter().cloned());
    }
    if let Some(arr) = b.as_array() {
        out.extend(arr.iter().cloned());
    }
    JsValue::Array(out)
}

/// `Array.prototype.slice(start, end?)` AND `String.prototype.slice`
/// (the `string-slice` divergence) -- the adapter emits the same
/// `bf.slice(recv, start, end)` call for both receiver shapes (it
/// can't disambiguate string vs. array at compile time), so this
/// dispatches on `recv`'s `JsValue` variant, mirroring `includes` /
/// `length` above.
pub fn slice(recv: &JsValue, start: &JsValue, end: &JsValue) -> JsValue {
    if let JsValue::String(s) = recv {
        let length = char_len(s) as i64;
        let (s_idx, e_idx) = clamp_slice_range(length, start, end);
        return JsValue::String(char_slice_range(s, s_idx as usize, e_idx as usize));
    }
    let items = match recv.as_array() {
        Some(a) => a,
        None => return JsValue::Array(Vec::new()),
    };
    let length = items.len() as i64;
    if length == 0 {
        return JsValue::Array(Vec::new());
    }
    let (s, e) = clamp_slice_range(length, start, end);
    if s >= e {
        return JsValue::Array(Vec::new());
    }
    JsValue::Array(items[s as usize..e as usize].to_vec())
}

/// Build a TRUE residual object -- every key of `recv` NOT listed in
/// `exclude` -- for a `.map()` callback's object-rest destructure binding
/// (`{ id, title, ...rest }`, #2087 Phase B). Mirrors `slice`'s array-rest
/// counterpart: the adapter binds the destructured local straight to this
/// helper's result (`{% set rest = bf.omit(item, ["id", "title"]) %}`), so a
/// member read (`rest.flag`) or the existing `{...rest}` spread emit
/// (`bf.spread_attrs`) both see only the non-destructured keys, same as the
/// Hono/CSR IIFE (`(({ id: __bfR0, title: __bfR1, ...__bfRest }) =>
/// __bfRest)(__bfItem())`). A non-object `recv`, or a non-array `exclude`,
/// degrades to an empty object (consistent with `slice`'s non-array-recv →
/// empty-array fallback) rather than panicking.
pub fn omit(recv: &JsValue, exclude: &JsValue) -> JsValue {
    let map = match recv.as_object() {
        Some(m) => m,
        None => return JsValue::Object(BTreeMap::new()),
    };
    let exclude_keys: HashSet<&str> =
        exclude.as_array().unwrap_or(&[]).iter().filter_map(|v| v.as_str()).collect();
    JsValue::Object(
        map.iter()
            .filter(|(k, _)| !exclude_keys.contains(k.as_str()))
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect(),
    )
}

pub fn reverse(recv: &JsValue) -> JsValue {
    match recv.as_array() {
        Some(a) => {
            let mut v = a.to_vec();
            v.reverse();
            JsValue::Array(v)
        }
        None => JsValue::Array(Vec::new()),
    }
}

pub fn trim(recv: &JsValue) -> String {
    match recv {
        JsValue::Null | JsValue::Array(_) | JsValue::Object(_) => String::new(),
        other => js_string(other).trim().to_string(),
    }
}

/// `String.prototype.trimStart()` -- the one-sided sibling of `trim`
/// above (#2183 follow-up), via Rust's native `str::trim_start`.
pub fn trim_start(recv: &JsValue) -> String {
    match recv {
        JsValue::Null | JsValue::Array(_) | JsValue::Object(_) => String::new(),
        other => js_string(other).trim_start().to_string(),
    }
}

/// `String.prototype.trimEnd()` -- the one-sided sibling of `trim`
/// above (#2183 follow-up), via Rust's native `str::trim_end`.
pub fn trim_end(recv: &JsValue) -> String {
    match recv {
        JsValue::Null | JsValue::Array(_) | JsValue::Object(_) => String::new(),
        other => js_string(other).trim_end().to_string(),
    }
}

pub fn split(recv: &JsValue, sep: Option<&JsValue>, limit: Option<i64>) -> JsValue {
    let s = scalar_or_empty(recv);
    let mut parts: Vec<String> = match sep {
        None => vec![s],
        Some(JsValue::Null) => vec![s],
        Some(sep_v) => {
            let sep_s = js_string(sep_v);
            if sep_s.is_empty() {
                s.chars().map(|c| c.to_string()).collect()
            } else if s.is_empty() {
                vec![String::new()]
            } else {
                s.split(sep_s.as_str()).map(str::to_string).collect()
            }
        }
    };
    if let Some(n) = limit {
        if n == 0 {
            parts.clear();
        } else if n > 0 && (n as usize) < parts.len() {
            parts.truncate(n as usize);
        }
    }
    JsValue::Array(parts.into_iter().map(JsValue::String).collect())
}

pub fn starts_with(recv: &JsValue, prefix: &JsValue, position: &JsValue) -> bool {
    let mut s = scalar_or_empty(recv);
    let p = js_string(prefix);
    if !matches!(position, JsValue::Null) {
        let len = char_len(&s);
        let n = (num::to_f64(position).max(0.0) as usize).min(len);
        s = char_slice_from(&s, n);
    }
    s.starts_with(&p)
}

pub fn ends_with(recv: &JsValue, suffix: &JsValue, end_position: &JsValue) -> bool {
    let mut s = scalar_or_empty(recv);
    let x = js_string(suffix);
    if !matches!(end_position, JsValue::Null) {
        let len = char_len(&s);
        let e = (num::to_f64(end_position).max(0.0) as usize).min(len);
        s = char_slice_to(&s, e);
    }
    if x.is_empty() {
        return true;
    }
    let (ls, lx) = (char_len(&s), char_len(&x));
    if ls < lx {
        return false;
    }
    char_slice_from(&s, ls - lx) == x
}

pub fn replace(recv: &JsValue, pattern: &JsValue, replacement: &JsValue) -> String {
    let s = scalar_or_empty(recv);
    let o = js_string(pattern);
    let n = js_string(replacement);
    if o.is_empty() {
        return format!("{n}{s}");
    }
    match s.find(&o) {
        None => s,
        Some(byte_idx) => format!("{}{}{}", &s[..byte_idx], n, &s[byte_idx + o.len()..]),
    }
}

/// `String.prototype.replaceAll(pattern, replacement)`, string-pattern
/// form only (#2182) -- every occurrence, the all-occurrences sibling
/// of `replace` above. Rust's own `str::replace` (no count arg) is
/// already global by default, including the empty-pattern-inserts-at-
/// every-boundary edge case (`"abc".replace("", "X")` -> "XaXbXcX"),
/// so it needs no hand-rolled loop the way `replace_all` on the
/// backends whose native replace is first-occurrence-only does.
pub fn replace_all(recv: &JsValue, pattern: &JsValue, replacement: &JsValue) -> String {
    let s = scalar_or_empty(recv);
    let o = js_string(pattern);
    let n = js_string(replacement);
    s.replace(&o, &n)
}

/// `queryHref(base, {...})` (#2042) -- build `"$base?k=v&..."` from a flat
/// list of (guard, key, value) triples. A pair is included iff its guard is
/// JS-truthy AND its value is a non-empty string. A value may also be a
/// list, appending one pair per non-empty member. Repeating a key
/// overwrites the value at its first position.
pub fn query(base: &JsValue, triples: &[JsValue]) -> String {
    let b = scalar_or_empty(base);
    let mut pairs: Vec<(String, String)> = Vec::new();
    let mut pos: HashMap<String, usize> = HashMap::new();
    let mut i = 0;
    while i + 2 < triples.len() {
        let (guard, key, val) = (&triples[i], &triples[i + 1], &triples[i + 2]);
        i += 3;
        if !js_truthy(guard) {
            continue;
        }
        let key_s = scalar_or_empty(key);
        if let JsValue::Array(vals) = val {
            for m in vals {
                let s = scalar_or_empty(m);
                if s.is_empty() {
                    continue;
                }
                pairs.push((key_s.clone(), s));
            }
            continue;
        }
        let val_s = scalar_or_empty(val);
        if val_s.is_empty() {
            continue;
        }
        if let Some(&idx) = pos.get(&key_s) {
            pairs[idx] = (key_s, val_s);
        } else {
            pos.insert(key_s.clone(), pairs.len());
            pairs.push((key_s, val_s));
        }
    }
    if pairs.is_empty() {
        return b;
    }
    let joined = pairs.iter().map(|(k, v)| format!("{}={}", form_escape_str(k), form_escape_str(v))).collect::<Vec<_>>().join("&");
    format!("{b}?{joined}")
}

pub fn repeat(recv: &JsValue, count: &JsValue) -> String {
    let s = scalar_or_empty(recv);
    let n = if matches!(count, JsValue::Null) { 0 } else { num::to_f64(count) as i64 };
    if n > 0 { s.repeat(n as usize) } else { String::new() }
}

// Re-export form_escape for callers that want a JsValue-in convenience
// (used by `query`'s internal string-shaped pairs already, kept for parity
// with runtime.py's `_form_escape` free-function shape).
#[allow(dead_code)]
fn _form_escape_value(v: &JsValue) -> String {
    form_escape(v)
}
