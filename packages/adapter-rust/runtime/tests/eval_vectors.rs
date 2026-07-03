//! Golden ParsedExpr-evaluator vectors, ported from
//! `packages/adapter-jinja/python/tests/test_eval_vectors.py` (itself a
//! port of `packages/adapter-perl/t/eval_vectors.t`).
//!
//! Runs `packages/adapter-tests/helper-vectors/eval-vectors.json` --
//! generated from the JS reference evaluator, shared with the Go and Perl
//! evaluators -- against `barefootjs::evaluator::evaluate`. The evaluator
//! is JS-faithful by contract, so unlike the helper vectors there are NO
//! Rust-side divergences here: each case's real ParsedExpr tree, evaluated
//! against its environment, must reproduce the JS-computed expect exactly.

use barefootjs::evaluator::{self, Env};
use barefootjs::num::JsValue;
use serde_json::Value as JsonValue;
use std::path::PathBuf;

fn vectors_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../adapter-tests/helper-vectors/eval-vectors.json")
}

/// Spec value-compat comparison -- non-finite sentinel hashes, booleans by
/// TYPE (the evaluator result must ITSELF be a real bool, not a truthy
/// number), numbers numerically, arrays/objects recursively, strings by
/// equality.
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
        return matches!(got, JsValue::Bool(g) if *g == b);
    }
    if let Some(arr) = expect.as_array() {
        return match got {
            JsValue::Array(g) => g.len() == arr.len() && g.iter().zip(arr).all(|(g, e)| matches(g, e)),
            _ => false,
        };
    }
    if let Some(obj) = expect.as_object() {
        return match got {
            JsValue::Object(g) => g.len() == obj.len() && obj.iter().all(|(k, v)| g.get(k).map(|gv| matches(gv, v)).unwrap_or(false)),
            _ => false,
        };
    }
    // Numeric comparison only when BOTH are real numbers (not
    // numeric-looking strings) -- e.g. String(42) must return the string
    // "42", and evaluating it as the number 42 must NOT pass.
    if let Some(n) = expect.as_f64() {
        return matches!(got, JsValue::Number(g) if *g == n);
    }
    if let Some(s) = expect.as_str() {
        return matches!(got, JsValue::String(g) if g == s);
    }
    false
}

#[test]
fn eval_vectors_match_js_reference() {
    let path = vectors_path();
    if !path.exists() {
        eprintln!("skipping: eval vectors not available outside the monorepo checkout ({path:?})");
        return;
    }
    let doc: JsonValue = serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
    let cases = doc["cases"].as_array().expect("eval-vectors.json has no cases");
    assert!(!cases.is_empty(), "eval-vectors.json contains no cases");

    let mut failures = Vec::new();
    for case in cases {
        let note = case["note"].as_str().unwrap_or("<unnamed>");
        let expr = &case["expr"];
        let expect = &case["expect"];
        let env: Env = case["env"]
            .as_object()
            .map(|m| m.iter().map(|(k, v)| (k.clone(), JsValue::from_json(v))).collect())
            .unwrap_or_default();

        let got = evaluator::evaluate(expr, &env);
        if !matches(&got, expect) {
            failures.push(format!("{note}: got {got:?}, want {expect:?}"));
        }
    }
    assert!(failures.is_empty(), "\n{}", failures.join("\n"));
}
