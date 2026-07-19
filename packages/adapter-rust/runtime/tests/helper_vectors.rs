//! Golden helper-vector conformance, ported from
//! `packages/adapter-jinja/python/tests/test_helper_vectors.py` (itself a
//! port of `packages/adapter-perl/t/helper_vectors.t`).
//!
//! Runs `packages/adapter-tests/vectors/vectors.json` -- generated from the
//! JS reference implementations (spec/template-helpers.md) -- against this
//! crate's `runtime` free functions, bound to the exact shape a compiled
//! minijinja template would execute (a `bf.<method>(...)` call, or the
//! native operator the adapter emits for `add`/`sub`/`mul`/`div`/`neg`).
//!
//! Per PR #2084 ("Promote golden vectors to a first-class JSON corpus with
//! JSON-declared per-backend divergences"), this backend's divergences and
//! unsupported helpers are NOT hard-coded in this file -- they are declared
//! in `tests/vector-divergences.json` (schema: `packages/adapter-tests/
//! vectors/README.md`, "Divergence declarations"), the same convention the
//! Go/Perl/Python/Ruby runners use. Only the language-specific bindings
//! table (`call_binding` below) stays code, mirroring
//! `packages/adapter-go-template/runtime/vectors_test.go`.
//!
//! Two of the Python port's divergences VANISH for this backend because
//! `f64` arithmetic is IEEE-754-native (see `num.rs`'s module docstring):
//! `add`'s safe-integer-edge rounding and `div`'s zero-divisor case both now
//! match the JS-normative expect exactly, so they carry NO entry in
//! `tests/vector-divergences.json`.

use barefootjs::backend_minijinja;
use barefootjs::date;
use barefootjs::num::{self, JsValue};
use barefootjs::runtime;
use barefootjs::SearchParams;
use serde::Deserialize;
use serde_json::Value as JsonValue;
use std::collections::{BTreeMap, HashMap, HashSet};
use std::path::PathBuf;

fn vectors_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../adapter-tests/vectors/vectors.json")
}

fn divergences_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/vector-divergences.json")
}

fn obj(v: &JsValue, key: &str) -> JsValue {
    v.as_object().and_then(|m| m.get(key)).cloned().unwrap_or(JsValue::Null)
}

/// Materializes the `{"$date": "<ISO>"}` native-date arg sentinel (#2288)
/// into this runtime's own `JsValue::Date`, so `date()`'s native-receiver
/// branch (not just its ISO-string branch) is exercised. Recurses through
/// arrays/objects the same shape the Perl port's `normalize_arg` walks,
/// since a vector's `args` may nest the sentinel inside a higher-order
/// projection payload. Panics on an unparseable `$date` string -- the
/// corpus is generated from a fixed set of known-good ISO instants, so a
/// parse failure here means the harness itself is broken, not the case
/// under test.
fn materialize_arg(v: &JsonValue) -> JsValue {
    if let Some(o) = v.as_object() {
        if let Some(iso) = o.get("$date").and_then(|d| d.as_str()) {
            if o.len() == 1 {
                let ms = date::parse_iso8601(iso).unwrap_or_else(|| panic!("materialize_arg: invalid $date {iso:?}"));
                return JsValue::Date(ms);
            }
        }
        return JsValue::Object(o.iter().map(|(k, x)| (k.clone(), materialize_arg(x))).collect());
    }
    if let Some(a) = v.as_array() {
        return JsValue::Array(a.iter().map(materialize_arg).collect());
    }
    JsValue::from_json(v)
}

/// Mirrors `test_helper_vectors.py`'s `_truthy_pred`.
fn truthy_pred(item: &JsValue, field: &str) -> bool {
    runtime::js_truthy(&obj(item, field))
}

/// Mirrors `_field_eq_pred`, routed through `num::strict_eq` (kind-aware
/// JS `===`) rather than a bespoke comparison -- the SAME choice
/// `runtime::index_of`/`last_index_of` make (see `runtime.rs`'s module
/// docstring), for the same reason.
fn field_eq_pred(item: &JsValue, field: &str, value: &JsValue) -> bool {
    item.as_object().map(|m| m.get(field).map(|v| num::strict_eq(v, value)).unwrap_or(false)).unwrap_or(false)
}

fn bind_sort(recv: &JsValue, spec_args: &[JsValue]) -> JsValue {
    let mut keys = Vec::new();
    for chunk in spec_args.chunks(4) {
        if chunk.len() < 4 {
            break;
        }
        let mut m = BTreeMap::new();
        m.insert("key_kind".to_string(), chunk[0].clone());
        m.insert("key".to_string(), chunk[1].clone());
        m.insert("compare_type".to_string(), chunk[2].clone());
        m.insert("direction".to_string(), chunk[3].clone());
        keys.push(JsValue::Object(m));
    }
    let mut opts = BTreeMap::new();
    opts.insert("keys".to_string(), JsValue::Array(keys));
    runtime::sort(recv, &JsValue::Object(opts))
}

fn bind_reduce(args: &[JsValue]) -> JsValue {
    // [recv, op, key_kind, key, type, init, direction]
    let (recv, op, key_kind, key, rtype, init, direction) = (&args[0], &args[1], &args[2], &args[3], &args[4], &args[5], &args[6]);
    let rtype_s = rtype.as_str().unwrap_or("numeric");
    let seed = if rtype_s == "numeric" { JsValue::Number(runtime::js_number(init)) } else { init.clone() };
    let mut opts = BTreeMap::new();
    opts.insert("op".to_string(), op.clone());
    opts.insert("key_kind".to_string(), key_kind.clone());
    opts.insert("key".to_string(), key.clone());
    opts.insert("type".to_string(), rtype.clone());
    opts.insert("init".to_string(), seed);
    opts.insert("direction".to_string(), direction.clone());
    runtime::reduce(recv, &JsValue::Object(opts))
}

fn bind_flat_map_tuple(recv: &JsValue, flat_args: &[JsValue]) -> JsValue {
    let specs: Vec<(String, String)> = flat_args.chunks(2).filter(|c| c.len() == 2).map(|c| (runtime::js_string(&c[0]), runtime::js_string(&c[1]))).collect();
    runtime::flat_map_tuple(recv, &specs)
}

/// One binding per canonical helper id. `add`/`sub`/`mul`/`div`/`neg` are
/// not `runtime` functions (the adapter lowers JS `+`/`-`/`*`/`/`/unary
/// `-` to the native minijinja operator, not a `bf.` call, mirroring the
/// Perl/Python ports); `mod` DOES route through `runtime::js_mod`-backed
/// dispatch since the plan requires the minijinja emitter to use `bf.mod`
/// for JS `%`.
fn call_binding(fn_name: &str, args: &[JsValue]) -> Option<JsValue> {
    let a = |i: usize| args.get(i).cloned().unwrap_or(JsValue::Null);
    Some(match fn_name {
        "add" => JsValue::Number(num::to_f64(&a(0)) + num::to_f64(&a(1))),
        "sub" => JsValue::Number(num::to_f64(&a(0)) - num::to_f64(&a(1))),
        "mul" => JsValue::Number(num::to_f64(&a(0)) * num::to_f64(&a(1))),
        "div" => JsValue::Number(num::to_f64(&a(0)) / num::to_f64(&a(1))),
        "mod" => JsValue::Number(num::js_mod(runtime::js_number(&a(0)), runtime::js_number(&a(1)))),
        "neg" => JsValue::Number(-num::to_f64(&a(0))),
        "string" => JsValue::String(runtime::js_string(&a(0))),
        "json" => JsValue::String(backend_minijinja::encode_json(&a(0))),
        "number" => JsValue::Number(runtime::js_number(&a(0))),
        "floor" => JsValue::Number(num::js_floor(runtime::js_number(&a(0)))),
        "ceil" => JsValue::Number(num::js_ceil(runtime::js_number(&a(0)))),
        "round" => JsValue::Number(num::js_round(runtime::js_number(&a(0)))),
        "min" => JsValue::Number(num::js_min(runtime::js_number(&a(0)), runtime::js_number(&a(1)))),
        "max" => JsValue::Number(num::js_max(runtime::js_number(&a(0)), runtime::js_number(&a(1)))),
        "abs" => JsValue::Number(num::js_abs(runtime::js_number(&a(0)))),
        "to_fixed" => {
            let digits = if args.len() > 1 { num::to_f64(&a(1)) as i32 } else { 0 };
            JsValue::String(num::to_fixed(runtime::js_number(&a(0)), digits))
        }
        "date" => date::date(&a(0), a(1).as_str().unwrap_or("")),
        "format_date" => JsValue::String(date::format_date(&a(0), a(1).as_str().unwrap_or(""), a(2).as_str().unwrap_or(""))),
        "lower" => JsValue::String(runtime::js_string(&a(0)).to_lowercase()),
        "upper" => JsValue::String(runtime::js_string(&a(0)).to_uppercase()),
        "trim" => JsValue::String(runtime::trim(&a(0))),
        "trim_start" => JsValue::String(runtime::trim_start(&a(0))),
        "trim_end" => JsValue::String(runtime::trim_end(&a(0))),
        "starts_with" => JsValue::Bool(runtime::starts_with(&a(0), &a(1), &a(2))),
        "ends_with" => JsValue::Bool(runtime::ends_with(&a(0), &a(1), &a(2))),
        "replace" => JsValue::String(runtime::replace(&a(0), &a(1), &a(2))),
        "replace_all" => JsValue::String(runtime::replace_all(&a(0), &a(1), &a(2))),
        "repeat" => JsValue::String(runtime::repeat(&a(0), &a(1))),
        "pad_start" => JsValue::String(runtime::pad(&runtime::js_string(&a(0)), &a(1), &a(2), true)),
        "pad_end" => JsValue::String(runtime::pad(&runtime::js_string(&a(0)), &a(1), &a(2), false)),
        "split" => {
            let sep = if args.len() > 1 { Some(a(1)) } else { None };
            let limit = if args.len() > 2 && !matches!(a(2), JsValue::Null) { Some(num::to_f64(&a(2)) as i64) } else { None };
            runtime::split(&a(0), sep.as_ref(), limit)
        }
        "len" => JsValue::Number(runtime::length(&a(0))),
        "at" => runtime::at(&a(0), &a(1)),
        "includes" => JsValue::Bool(runtime::includes(&a(0), &a(1))),
        "index_of" => JsValue::Number(runtime::array_index_of(&a(0), &a(1), false) as f64),
        "last_index_of" => JsValue::Number(runtime::array_index_of(&a(0), &a(1), true) as f64),
        "concat" => runtime::concat(&a(0), &a(1)),
        "slice" => runtime::slice(&a(0), &a(1), &a(2)),
        "reverse" => runtime::reverse(&a(0)),
        "flat" => {
            let depth = if args.len() > 1 { num::to_f64(&a(1)) as i64 } else { 1 };
            JsValue::Array(runtime::flat(a(0).as_array().unwrap_or(&[]), depth))
        }
        "flat_dynamic" => JsValue::Array(runtime::flat_dynamic(a(0).as_array().unwrap_or(&[]), &a(1))),
        "join" => JsValue::String(runtime::join(&a(0), &a(1))),
        "arr" => JsValue::Array(args.to_vec()),
        "filter_truthy" => JsValue::Array(a(0).as_array().unwrap_or(&[]).iter().filter(|x| runtime::js_truthy(x)).cloned().collect()),
        "search_params_get" => match SearchParams::new(&runtime::js_string(&a(0))).get(&runtime::js_string(&a(1))) {
            Some(v) => JsValue::String(v.to_string()),
            None => JsValue::Null,
        },
        "query" => JsValue::String(runtime::query(&a(0), &args[1..])),
        "every" => JsValue::Bool(a(0).as_array().unwrap_or(&[]).iter().all(|item| truthy_pred(item, a(1).as_str().unwrap_or("")))),
        "some" => JsValue::Bool(a(0).as_array().unwrap_or(&[]).iter().any(|item| truthy_pred(item, a(1).as_str().unwrap_or("")))),
        "filter" => JsValue::Array(a(0).as_array().unwrap_or(&[]).iter().filter(|item| field_eq_pred(item, a(1).as_str().unwrap_or(""), &a(2))).cloned().collect()),
        "find" => a(0).as_array().unwrap_or(&[]).iter().find(|item| field_eq_pred(item, a(1).as_str().unwrap_or(""), &a(2))).cloned().unwrap_or(JsValue::Null),
        "find_index" => JsValue::Number(a(0).as_array().unwrap_or(&[]).iter().position(|item| field_eq_pred(item, a(1).as_str().unwrap_or(""), &a(2))).map(|i| i as f64).unwrap_or(-1.0)),
        "find_last" => a(0).as_array().unwrap_or(&[]).iter().rev().find(|item| field_eq_pred(item, a(1).as_str().unwrap_or(""), &a(2))).cloned().unwrap_or(JsValue::Null),
        "find_last_index" => {
            let items = a(0).as_array().unwrap_or(&[]).to_vec();
            let idx = (0..items.len()).rev().find(|&i| field_eq_pred(&items[i], a(1).as_str().unwrap_or(""), &a(2)));
            JsValue::Number(idx.map(|i| i as f64).unwrap_or(-1.0))
        }
        "sort" => bind_sort(&a(0), &args[1..]),
        "reduce" => bind_reduce(args),
        "flat_map" => runtime::flat_map(&a(0), a(1).as_str().unwrap_or(""), a(2).as_str().unwrap_or("")),
        "flat_map_tuple" => bind_flat_map_tuple(&a(0), &args[1..]),
        _ => return None,
    })
}

/// Spec value-compat comparison against a JSON-decoded expect -- sentinel
/// hashes, booleans by truthiness, numbers numerically, arrays/objects
/// recursively.
fn matches(got: &JsValue, expect: &JsonValue) -> bool {
    if expect.is_null() {
        return matches!(got, JsValue::Null);
    }
    if let Some(kind) = expect.get("$num").and_then(|v| v.as_str()) {
        return match got {
            JsValue::Number(g) => match kind {
                "NaN" => g.is_nan(),
                "Infinity" => *g == f64::INFINITY,
                "-Infinity" => *g == f64::NEG_INFINITY,
                _ => false,
            },
            _ => false,
        };
    }
    if let Some(b) = expect.as_bool() {
        return py_truthy(got) == b;
    }
    if let Some(arr) = expect.as_array() {
        return match got {
            JsValue::Array(g) => g.len() == arr.len() && g.iter().zip(arr).all(|(g, e)| matches(g, e)),
            _ => false,
        };
    }
    if let Some(o) = expect.as_object() {
        return match got {
            JsValue::Object(g) => g.len() == o.len() && o.iter().all(|(k, v)| g.get(k).map(|gv| matches(gv, v)).unwrap_or(false)),
            _ => false,
        };
    }
    if matches!(got, JsValue::Null | JsValue::Array(_) | JsValue::Object(_)) {
        return false;
    }
    if let Some(n) = expect.as_f64() {
        return matches!(got, JsValue::Number(g) if *g == n);
    }
    if let Some(s) = expect.as_str() {
        return matches!(got, JsValue::String(g) if g == s);
    }
    false
}

/// Python truthiness of a decoded value (empty array/object IS falsy,
/// unlike JS) -- only used for the boolean-expect comparison branch above,
/// mirroring `test_helper_vectors.py`'s `bool(got) == expect`, which relies
/// on Python's own (non-JS) `bool()` conversion.
fn py_truthy(v: &JsValue) -> bool {
    match v {
        JsValue::Null => false,
        JsValue::Bool(b) => *b,
        JsValue::Number(n) => !n.is_nan() && *n != 0.0,
        JsValue::String(s) => !s.is_empty(),
        JsValue::Array(a) => !a.is_empty(),
        JsValue::Object(o) => !o.is_empty(),
        // Unreachable: no binding in this file ever returns a
        // `JsValue::Date` (`date()` itself always returns `Number` or
        // `String`, per its own return type) -- kept exhaustive since
        // `JsValue` is a shared enum.
        JsValue::Date(_) => true,
    }
}

/// Shape of `tests/vector-divergences.json`
/// (`packages/adapter-tests/vectors/README.md`, "Divergence declarations").
/// Keyed by the case key `fn + "/" + note`, it is the single source of
/// truth for this backend's divergences and unsupported helpers -- the spec
/// stays backend-neutral, and this file is also validated centrally by
/// `packages/adapter-tests/src/__tests__/divergences.test.ts`.
#[derive(Deserialize)]
struct DivergenceEntry {
    #[serde(default)]
    expect: Option<JsonValue>,
    #[serde(default)]
    throws: bool,
    #[allow(dead_code)]
    #[serde(default)]
    exception: Option<String>,
    reason: String,
}

#[derive(Deserialize)]
struct DivergenceFile {
    #[allow(dead_code)]
    version: i64,
    #[allow(dead_code)]
    backend: String,
    divergences: HashMap<String, DivergenceEntry>,
    unsupported: HashMap<String, String>,
}

#[test]
fn helper_vectors_match_js_reference_or_declared_divergence() {
    let path = vectors_path();
    if !path.exists() {
        eprintln!("skipping: golden vectors not available outside the monorepo checkout ({path:?})");
        return;
    }
    let doc: JsonValue = serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
    let cases = doc["cases"].as_array().expect("vectors.json has no cases");
    assert!(!cases.is_empty(), "vectors.json contains no cases");

    // Declarations live in tests/vector-divergences.json, not inline, so
    // this harness and the other backends' harnesses share one JSON
    // schema (packages/adapter-tests/vectors/README.md, "Divergence
    // declarations"). This harness still enforces the machinery itself:
    // stale declarations (the backend now matches JS) and dead
    // declarations (the case they reference no longer exists) both fail
    // the suite.
    let div_path = divergences_path();
    let div_raw = std::fs::read_to_string(&div_path).unwrap_or_else(|e| panic!("read {div_path:?}: {e}"));
    let div_file: DivergenceFile = serde_json::from_str(&div_raw).unwrap_or_else(|e| panic!("parse {div_path:?}: {e}"));

    let mut declared = HashSet::new();
    let mut failures = Vec::new();

    for case in cases {
        let fn_name = case["fn"].as_str().unwrap();
        let note = case["note"].as_str().unwrap();
        let key = format!("{fn_name}/{note}");
        let raw_args = case["args"].as_array().cloned().unwrap_or_default();
        let args: Vec<JsValue> = raw_args.iter().map(materialize_arg).collect();
        let expect = &case["expect"];

        if let Some(reason) = div_file.unsupported.get(fn_name) {
            eprintln!("SKIP {key}: unsupported on this backend: {reason}");
            continue;
        }

        let got = match call_binding(fn_name, &args) {
            Some(v) => v,
            None => {
                failures.push(format!("{key}: no Rust binding for helper '{fn_name}' -- add it to call_binding"));
                continue;
            }
        };

        if let Some(entry) = div_file.divergences.get(&key) {
            declared.insert(key.clone());
            if matches(&got, expect) {
                failures.push(format!("stale divergence declaration for '{key}' -- the backend now matches JS ({got:?}); remove it"));
                continue;
            }
            if entry.throws {
                failures.push(format!("{key}: throws divergences are not supported by the Rust harness -- bindings return values, not Results"));
                continue;
            }
            let pinned = match &entry.expect {
                Some(v) => v,
                None => {
                    failures.push(format!("{key}: malformed divergence declaration -- missing expect"));
                    continue;
                }
            };
            if !matches(&got, pinned) {
                failures.push(format!("{key} (declared divergence: {}): got {got:?}, pinned {pinned:?}", entry.reason));
            }
            continue;
        }

        if !matches(&got, expect) {
            failures.push(format!("{key}: got {got:?}, want {expect:?}"));
        }
    }

    // A declaration referencing a case that no longer exists is dead --
    // likely a renamed note. Fail so the key gets re-pointed.
    for key in div_file.divergences.keys() {
        if !declared.contains(key) {
            failures.push(format!("divergence declaration matches no vector case -- renamed note? {key}"));
        }
    }

    assert!(failures.is_empty(), "\n{}", failures.join("\n"));
}
