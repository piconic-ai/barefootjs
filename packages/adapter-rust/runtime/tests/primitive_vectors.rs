//! JS primitive-operation vector conformance
//! (`spec/js-primitive-semantics.md`, "Conformance"): every
//! `packages/adapter-tests/vectors/primitives/<op>.json` case runs against
//! the `runtime` helper a compiled MiniJinja template calls (`bf.<op>(...)`)
//! for that operation. The step-0 expected-failure ledger
//! (`packages/adapter-tests/vectors/primitives-expected-failures.json`) lists
//! the cases that fail on Rust today, each naming the rollout step that
//! removes it. It may only shrink: an unlisted failure fails, and so does a
//! listed case that now passes. Skipped outside a monorepo checkout.

use barefootjs::num::JsValue;
use barefootjs::runtime;
use serde_json::Value as JsonValue;
use std::collections::HashSet;
use std::path::PathBuf;

fn vectors_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../adapter-tests/vectors")
}

/// One binding per op, to the helper compiled templates call. `None` for an
/// op with no binding, which fails.
fn call_binding(fn_name: &str, a: &[JsValue]) -> Option<JsValue> {
    Some(match fn_name {
        "truthy" => JsValue::Bool(runtime::js_truthy(&a[0])),
        "to_number" => JsValue::Number(runtime::js_to_number(&a[0])),
        "to_string" => JsValue::String(runtime::js_to_string(&a[0])),
        "get" => runtime::js_get(&a[0], &a[1]),
        "strict_eq" => JsValue::Bool(runtime::js_strict_eq(&a[0], &a[1])),
        "lt" => JsValue::Bool(runtime::js_relational("<", &a[0], &a[1])),
        "le" => JsValue::Bool(runtime::js_relational("<=", &a[0], &a[1])),
        "gt" => JsValue::Bool(runtime::js_relational(">", &a[0], &a[1])),
        "ge" => JsValue::Bool(runtime::js_relational(">=", &a[0], &a[1])),
        "plus" => runtime::js_plus(&a[0], &a[1]),
        "neg" => runtime::js_neg(&a[0]),
        "number" => JsValue::Number(runtime::js_number(&a[0])),
        _ => return None,
    })
}

/// One binding per op the MiniJinja adapter can spell natively, to the
/// native MiniJinja operator, over the values a template receives
/// (`js_to_mj`): a test is MiniJinja's own `{% if %}` / `not`; an index read
/// is MiniJinja's own `[]` (an undefined result reads as null); a number
/// literal is a MiniJinja literal; a relational operator is MiniJinja's own
/// `<` / `<=` / `>` / `>=`; a unary `+` over a number is the operand itself.
/// It runs over
/// the cases whose domain the adapter's NATIVE_SAFE table claims
/// (`primitives-native-safe.json`; spec/js-primitive-semantics.md,
/// "Conformance" item 3). `None` for an op with no native binding, which
/// fails.
fn call_native_binding(fn_name: &str, a: &[JsValue]) -> Option<JsValue> {
    Some(match fn_name {
        "truthy" => {
            let env = minijinja::Environment::new();
            let ctx = minijinja::context! { v => runtime::js_to_mj(&a[0]) };
            let out = env.render_str("{% if v %}1{% else %}0{% endif %}", ctx).expect("render the native test");
            JsValue::Bool(out == "1")
        }
        "get" => {
            let env = minijinja::Environment::new();
            let expr = env.compile_expression("recv[key]").expect("compile the native index read");
            let ctx = minijinja::context! { recv => runtime::js_to_mj(&a[0]), key => runtime::js_to_mj(&a[1]) };
            runtime::mj_to_js(&expr.eval(ctx).expect("evaluate the native index read"))
        }
        "number" => {
            let env = minijinja::Environment::new();
            let text = a[0].as_str().expect("a number literal's spelling is a string");
            let expr = env.compile_expression(text).expect("compile the native literal");
            runtime::mj_to_js(&expr.eval(()).expect("evaluate the native literal"))
        }
        "to_number" => a[0].clone(),
        // A strict equality over a proven pair is MiniJinja's own `==`
        // (#3824 step 8).
        "lt" | "le" | "gt" | "ge" | "strict_eq" => {
            let op = match fn_name {
                "lt" => "<",
                "le" => "<=",
                "gt" => ">",
                "strict_eq" => "==",
                _ => ">=",
            };
            let source = format!("a {op} b");
            let env = minijinja::Environment::new();
            let expr = env.compile_expression(&source).expect("compile the native comparison");
            let ctx = minijinja::context! { a => runtime::js_to_mj(&a[0]), b => runtime::js_to_mj(&a[1]) };
            runtime::mj_to_js(&expr.eval(ctx).expect("evaluate the native comparison"))
        }
        // A proven string is its own ToString; a `+` is MiniJinja's own `+`
        // over two numbers and `~` over a proven string, the other operand
        // through `to_string` (#3824 step 4).
        "to_string" => a[0].clone(),
        "plus" => {
            let env = minijinja::Environment::new();
            let is_str = |v: &JsValue| matches!(v, JsValue::String(_));
            if is_str(&a[0]) || is_str(&a[1]) {
                let str_of = |v: &JsValue| if is_str(v) { v.clone() } else { JsValue::String(runtime::js_to_string(v)) };
                let expr = env.compile_expression("a ~ b").expect("compile the native concatenation");
                let ctx = minijinja::context! { a => runtime::js_to_mj(&str_of(&a[0])), b => runtime::js_to_mj(&str_of(&a[1])) };
                runtime::mj_to_js(&expr.eval(ctx).expect("evaluate the native concatenation"))
            } else {
                let expr = env.compile_expression("a + b").expect("compile the native addition");
                let ctx = minijinja::context! { a => runtime::js_to_mj(&a[0]), b => runtime::js_to_mj(&a[1]) };
                runtime::mj_to_js(&expr.eval(ctx).expect("evaluate the native addition"))
            }
        }
        _ => return None,
    })
}

/// JSON to runtime value, resolving the `{"$num": ...}` sentinel (`-0`
/// included).
fn decode(v: &JsonValue) -> JsValue {
    if let Some(o) = v.as_object() {
        if o.len() == 1 {
            if let Some(kind) = o.get("$num").and_then(|k| k.as_str()) {
                return JsValue::Number(match kind {
                    "NaN" => f64::NAN,
                    "Infinity" => f64::INFINITY,
                    "-Infinity" => f64::NEG_INFINITY,
                    "-0" => -0.0,
                    other => panic!("unknown $num sentinel {other:?}"),
                });
            }
        }
        return JsValue::Object(o.iter().map(|(k, x)| (k.clone(), decode(x))).collect());
    }
    if let Some(a) = v.as_array() {
        return JsValue::Array(a.iter().map(decode).collect());
    }
    JsValue::from_json(v)
}

/// The primitives contract: types are strict, numbers compare as doubles and
/// a zero compares by sign.
fn matches(got: &JsValue, expect: &JsValue) -> bool {
    match (got, expect) {
        (JsValue::Null, JsValue::Null) => true,
        (JsValue::Bool(g), JsValue::Bool(e)) => g == e,
        (JsValue::String(g), JsValue::String(e)) => g == e,
        (JsValue::Number(g), JsValue::Number(e)) => {
            if e.is_nan() {
                g.is_nan()
            } else if *e == 0.0 && *g == 0.0 {
                e.is_sign_negative() == g.is_sign_negative()
            } else {
                g == e
            }
        }
        (JsValue::Array(g), JsValue::Array(e)) => g.len() == e.len() && g.iter().zip(e).all(|(g, e)| matches(g, e)),
        (JsValue::Object(g), JsValue::Object(e)) => {
            g.len() == e.len() && e.iter().all(|(k, v)| g.get(k).map(|gv| matches(gv, v)).unwrap_or(false))
        }
        _ => false,
    }
}

#[test]
fn primitive_vectors_match_js_reference_or_ledger() {
    let dir = vectors_dir().join("primitives");
    let mut files: Vec<PathBuf> = match std::fs::read_dir(&dir) {
        Ok(entries) => entries.filter_map(|e| e.ok().map(|e| e.path())).filter(|p| p.extension().is_some_and(|x| x == "json")).collect(),
        Err(_) => {
            eprintln!("skipping: primitive vectors not available outside the monorepo checkout ({dir:?})");
            return;
        }
    };
    files.sort();
    assert!(!files.is_empty(), "no primitives/*.json under {dir:?}");

    let ledger_path = vectors_dir().join("primitives-expected-failures.json");
    let ledger: JsonValue = serde_json::from_str(&std::fs::read_to_string(&ledger_path).unwrap()).unwrap();
    let expected = ledger["runtimes"]["rust"].as_object().expect("ledger has no \"rust\" runtime");

    let mut problems = Vec::new();
    let mut seen = HashSet::new();
    let (mut total, mut passed) = (0, 0);
    for path in &files {
        let doc: JsonValue = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
        for case in doc["cases"].as_array().unwrap() {
            let fn_name = case["fn"].as_str().unwrap();
            let key = format!("{fn_name}/{}", case["note"].as_str().unwrap());
            seen.insert(key.clone());
            total += 1;
            let args: Vec<JsValue> = case["args"].as_array().unwrap().iter().map(decode).collect();
            let expect = decode(&case["expect"]);
            let failure = match call_binding(fn_name, &args) {
                None => Some(format!("no Rust binding for '{fn_name}' -- add it to call_binding")),
                Some(got) if matches(&got, &expect) => None,
                Some(got) => Some(format!("got {got:?}, want {expect:?}")),
            };
            let listed = expected.get(&key);
            match (&failure, listed) {
                (None, Some(entry)) => problems.push(format!("ledger entry '{key}' now passes; remove it from the ledger (step {})", entry["step"])),
                (Some(detail), None) => problems.push(format!("UNEXPECTED-FAIL {key}: {detail}")),
                _ => {}
            }
            if failure.is_none() {
                passed += 1;
            }
        }
    }
    for key in expected.keys() {
        if !seen.contains(key) {
            problems.push(format!("ledger entry '{key}' matches no primitives case -- renamed note?"));
        }
    }
    println!("primitives: {total} cases, {passed} pass, {} in the expected-failure ledger", expected.len());
    assert!(problems.is_empty(), "\n{}", problems.join("\n"));
}

/// Every native claim gives the JS answer on every case it covers; no ledger
/// applies.
#[test]
fn native_claims_match_js_reference() {
    let claims_path = vectors_dir().join("primitives-native-safe.json");
    let Ok(raw) = std::fs::read_to_string(&claims_path) else {
        eprintln!("skipping: native claims not available outside the monorepo checkout ({claims_path:?})");
        return;
    };
    let doc: JsonValue = serde_json::from_str(&raw).unwrap();
    let claims = doc["runtimes"]["rust"].as_object().expect("primitives-native-safe.json has no \"rust\" runtime");
    let mut problems = Vec::new();
    let mut ran = 0;
    for (fn_name, domains) in claims {
        let domains: HashSet<&str> = domains.as_array().unwrap().iter().filter_map(|d| d.as_str()).collect();
        let path = vectors_dir().join("primitives").join(format!("{fn_name}.json"));
        let file: JsonValue = serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        for case in file["cases"].as_array().unwrap() {
            if !domains.contains(case["domain"].as_str().unwrap()) {
                continue;
            }
            ran += 1;
            let args: Vec<JsValue> = case["args"].as_array().unwrap().iter().map(decode).collect();
            let expect = decode(&case["expect"]);
            let note = case["note"].as_str().unwrap();
            match call_native_binding(fn_name, &args) {
                None => problems.push(format!("no native MiniJinja binding for '{fn_name}' -- add it to call_native_binding")),
                Some(got) if matches(&got, &expect) => {}
                Some(got) => problems.push(format!("NATIVE-FAIL {fn_name}/{note}: got {got:?}, want {expect:?}")),
            }
        }
    }
    println!("primitives (native): {ran} claimed cases");
    assert!(problems.is_empty(), "\n{}", problems.join("\n"));
}
