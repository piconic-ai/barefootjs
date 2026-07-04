//! JS-compat helper coverage (#1189), ported from
//! `packages/adapter-jinja/python/tests/test_template_primitives.py`
//! (itself a port of `packages/adapter-perl/t/template_primitives.t`).
//!
//! Covers the array/string method surface NOT already exercised
//! byte-for-byte by the shared golden vectors (`tests/helper_vectors.rs`)
//! -- receiver-type dispatch edge cases, mutation isolation (a helper must
//! return a NEW array, never alias the caller's -- automatic here since
//! every `runtime` helper takes `&JsValue` and returns an owned
//! `JsValue`), and the structured `sort` comparator dispatch. Also covers
//! the `*_eval` JSON-string-seam delegation (mirrors `EvalDelegationTest`).

use barefootjs::num::{self, JsValue};
use barefootjs::{evaluator, runtime};
use serde_json::json;
use std::collections::BTreeMap;

fn s(v: &str) -> JsValue {
    JsValue::from(v)
}
fn n(v: f64) -> JsValue {
    JsValue::Number(v)
}
fn arr(items: Vec<JsValue>) -> JsValue {
    JsValue::Array(items)
}
fn obj(pairs: &[(&str, JsValue)]) -> JsValue {
    JsValue::Object(pairs.iter().map(|(k, v)| (k.to_string(), v.clone())).collect::<BTreeMap<_, _>>())
}
fn is_nan(v: &JsValue) -> bool {
    matches!(v, JsValue::Number(x) if x.is_nan())
}

#[test]
fn json_helper() {
    let mut m = BTreeMap::new();
    m.insert("a".to_string(), n(1.0));
    assert_eq!(barefootjs::backend_minijinja::encode_json(&JsValue::Object(m)), "{\"a\":1}");
    assert_eq!(barefootjs::backend_minijinja::encode_json(&arr(vec![n(1.0), n(2.0), n(3.0)])), "[1,2,3]");
    assert_eq!(barefootjs::backend_minijinja::encode_json(&s("hi")), "\"hi\"");
    assert_eq!(barefootjs::backend_minijinja::encode_json(&JsValue::Null), "null");
}

#[test]
fn string_helper() {
    assert_eq!(runtime::js_string(&n(42.0)), "42");
    assert_eq!(runtime::js_string(&s("hi")), "hi");
    assert_eq!(runtime::js_string(&JsValue::Null), "");
    assert_eq!(runtime::js_string(&JsValue::Bool(true)), "true");
    assert_eq!(runtime::js_string(&JsValue::Bool(false)), "false");
    assert_eq!(runtime::js_string(&n(1.0)), "1");
}

#[test]
#[allow(clippy::approx_constant)] // literal test data ported from Python, not an approximation of pi
fn number_helper() {
    assert_eq!(runtime::js_number(&s("3.14")), 3.14);
    assert_eq!(runtime::js_number(&n(42.0)), 42.0);
    assert!(is_nan(&n(runtime::js_number(&s("not a num")))));
    assert!(runtime::js_number(&JsValue::Null).is_nan());
}

#[test]
fn floor_ceil_round() {
    assert_eq!(num::js_floor(3.7), 3.0);
    assert_eq!(num::js_floor(-3.2), -4.0);
    assert!(num::js_floor(runtime::js_number(&s("not"))).is_nan());

    assert_eq!(num::js_ceil(3.1), 4.0);
    assert_eq!(num::js_ceil(-3.7), -3.0);
    assert!(num::js_ceil(runtime::js_number(&s("not"))).is_nan());

    assert_eq!(num::js_round(3.5), 4.0);
    assert_eq!(num::js_round(3.4), 3.0);
    // JS Math.round ties go toward +Infinity, not away from zero.
    assert_eq!(num::js_round(-1.5), -1.0);
    assert_eq!(num::js_round(-1.6), -2.0);
    assert!(num::js_round(runtime::js_number(&s("not"))).is_nan());
}

#[test]
fn includes_dispatch() {
    assert!(runtime::includes(&arr(vec![s("a"), s("b"), s("c")]), &s("b")));
    assert!(!runtime::includes(&arr(vec![s("a"), s("b"), s("c")]), &s("z")));
    assert!(runtime::includes(&arr(vec![n(1.0), n(2.0), n(3.0)]), &n(2.0)));
    assert!(!runtime::includes(&arr(vec![]), &s("a")));
    assert!(runtime::includes(&arr(vec![JsValue::Null, s("a")]), &JsValue::Null));
    assert!(!runtime::includes(&arr(vec![s("a"), s("b")]), &JsValue::Null));

    // SameValueZero never coerces across types.
    assert!(!runtime::includes(&arr(vec![n(2.0)]), &s("2")));
    assert!(runtime::includes(&arr(vec![n(2.0)]), &n(2.0)));
    assert!(runtime::includes(&arr(vec![s("2")]), &s("2")));

    assert!(runtime::includes(&s("hello world"), &s("world")));
    assert!(!runtime::includes(&s("hello world"), &s("earth")));
    assert!(runtime::includes(&s("hello"), &s("")));
    assert!(!runtime::includes(&s(""), &s("x")));
    assert!(!runtime::includes(&JsValue::Null, &s("x")));

    assert!(!runtime::includes(&obj(&[("a", n(1.0))]), &s("a")));
}

#[test]
fn index_of_last_index_of() {
    let arr_v = arr(vec![s("a"), s("b"), s("c"), s("b"), s("d")]);
    assert_eq!(runtime::array_index_of(&arr_v, &s("a"), false), 0);
    assert_eq!(runtime::array_index_of(&arr_v, &s("b"), false), 1);
    assert_eq!(runtime::array_index_of(&arr_v, &s("d"), false), 4);
    assert_eq!(runtime::array_index_of(&arr_v, &s("z"), false), -1);
    assert_eq!(runtime::array_index_of(&arr(vec![]), &s("a"), false), -1);
    assert_eq!(runtime::array_index_of(&s("not an array"), &s("a"), false), -1);

    assert_eq!(runtime::array_index_of(&arr_v, &s("b"), true), 3);
    assert_eq!(runtime::array_index_of(&arr_v, &s("a"), true), 0);
    assert_eq!(runtime::array_index_of(&arr_v, &s("z"), true), -1);

    let with_nulls = arr(vec![JsValue::Null, s("x"), JsValue::Null]);
    assert_eq!(runtime::array_index_of(&with_nulls, &JsValue::Null, false), 0);
    assert_eq!(runtime::array_index_of(&with_nulls, &JsValue::Null, true), 2);
}

#[test]
fn at_helper() {
    let arr_v = arr(vec![s("a"), s("b"), s("c")]);
    assert_eq!(runtime::at(&arr_v, &n(0.0)), s("a"));
    assert_eq!(runtime::at(&arr_v, &n(2.0)), s("c"));
    assert_eq!(runtime::at(&arr_v, &n(-1.0)), s("c"));
    assert_eq!(runtime::at(&arr_v, &n(-3.0)), s("a"));
    assert_eq!(runtime::at(&arr_v, &n(3.0)), JsValue::Null);
    assert_eq!(runtime::at(&arr_v, &n(-4.0)), JsValue::Null);
    assert_eq!(runtime::at(&arr(vec![]), &n(0.0)), JsValue::Null);
    assert_eq!(runtime::at(&JsValue::Null, &n(0.0)), JsValue::Null);
    assert_eq!(runtime::at(&obj(&[("a", n(1.0))]), &n(0.0)), JsValue::Null);
}

#[test]
fn concat_mutation_isolation() {
    assert_eq!(runtime::concat(&arr(vec![s("a"), s("b")]), &arr(vec![s("c"), s("d")])), arr(vec![s("a"), s("b"), s("c"), s("d")]));
    assert_eq!(runtime::concat(&JsValue::Null, &arr(vec![s("a")])), arr(vec![s("a")]));
    assert_eq!(runtime::concat(&arr(vec![s("a")]), &JsValue::Null), arr(vec![s("a")]));

    let left = arr(vec![s("a"), s("b")]);
    let right = arr(vec![s("c"), s("d")]);
    let mut out = runtime::concat(&left, &right);
    if let JsValue::Array(v) = &mut out {
        v.push(s("mutated"));
    }
    assert_eq!(left, arr(vec![s("a"), s("b")]));
    assert_eq!(right, arr(vec![s("c"), s("d")]));
}

#[test]
fn slice_mutation_isolation_and_clamping() {
    let arr_v = arr(vec![s("a"), s("b"), s("c"), s("d"), s("e")]);
    assert_eq!(runtime::slice(&arr_v, &n(1.0), &n(3.0)), arr(vec![s("b"), s("c")]));
    assert_eq!(runtime::slice(&arr_v, &n(2.0), &JsValue::Null), arr(vec![s("c"), s("d"), s("e")]));
    assert_eq!(runtime::slice(&arr_v, &n(-2.0), &JsValue::Null), arr(vec![s("d"), s("e")]));
    assert_eq!(runtime::slice(&arr_v, &n(0.0), &n(-1.0)), arr(vec![s("a"), s("b"), s("c"), s("d")]));
    assert_eq!(runtime::slice(&arr_v, &n(100.0), &JsValue::Null), arr(vec![]));
    assert_eq!(runtime::slice(&arr_v, &n(3.0), &n(1.0)), arr(vec![]));
    assert_eq!(runtime::slice(&JsValue::Null, &n(0.0), &JsValue::Null), arr(vec![]));

    let src = arr(vec![s("a"), s("b"), s("c")]);
    let mut out = runtime::slice(&src, &n(0.0), &n(2.0));
    if let JsValue::Array(v) = &mut out {
        v.push(s("mutated"));
    }
    assert_eq!(src, arr(vec![s("a"), s("b"), s("c")]));
}

#[test]
fn reverse_mutation_isolation() {
    assert_eq!(runtime::reverse(&arr(vec![s("a"), s("b"), s("c")])), arr(vec![s("c"), s("b"), s("a")]));
    assert_eq!(runtime::reverse(&arr(vec![])), arr(vec![]));

    let src = arr(vec![s("a"), s("b"), s("c")]);
    let mut out = runtime::reverse(&src);
    if let JsValue::Array(v) = &mut out {
        v.push(s("mutated"));
    }
    assert_eq!(src, arr(vec![s("a"), s("b"), s("c")]));
    assert_eq!(runtime::reverse(&JsValue::Null), arr(vec![]));
}

#[test]
fn trim_helper() {
    assert_eq!(runtime::trim(&s("   padded   ")), "padded");
    assert_eq!(runtime::trim(&s("")), "");
    assert_eq!(runtime::trim(&JsValue::Null), "");
    assert_eq!(runtime::trim(&obj(&[("a", n(1.0))])), "");
    assert_eq!(runtime::trim(&n(42.0)), "42");
}

#[test]
fn split_helper() {
    assert_eq!(runtime::split(&s("a,b,c"), Some(&s(",")), None), arr(vec![s("a"), s("b"), s("c")]));
    assert_eq!(runtime::split(&s("a.b.c"), Some(&s(".")), None), arr(vec![s("a"), s("b"), s("c")]));
    assert_eq!(runtime::split(&s("a,"), Some(&s(",")), None), arr(vec![s("a"), s("")]));
    assert_eq!(runtime::split(&s(",a"), Some(&s(",")), None), arr(vec![s(""), s("a")]));
    assert_eq!(runtime::split(&s("abc"), Some(&s("")), None), arr(vec![s("a"), s("b"), s("c")]));
    assert_eq!(runtime::split(&s(""), Some(&s("")), None), arr(vec![]));
    assert_eq!(runtime::split(&s("abc"), Some(&s(",")), None), arr(vec![s("abc")]));
    assert_eq!(runtime::split(&s("a,b,c"), None, None), arr(vec![s("a,b,c")]));
    assert_eq!(runtime::split(&s("a,b,c,d"), Some(&s(",")), Some(2)), arr(vec![s("a"), s("b")]));
    assert_eq!(runtime::split(&s("a,b"), Some(&s(",")), Some(0)), arr(vec![]));
    assert_eq!(runtime::split(&JsValue::Null, Some(&s(",")), None), arr(vec![s("")]));
    assert_eq!(runtime::split(&n(42.0), Some(&s(",")), None), arr(vec![s("42")]));
}

#[test]
fn starts_with_ends_with_positions() {
    assert!(runtime::starts_with(&s("hello world"), &s("hello"), &JsValue::Null));
    assert!(runtime::starts_with(&s("anything"), &s(""), &JsValue::Null));
    assert!(runtime::ends_with(&s("hello world"), &s("world"), &JsValue::Null));
    assert!(runtime::starts_with(&s("abc"), &s("b"), &n(1.0)));
    assert!(!runtime::starts_with(&s("abc"), &s("a"), &n(99.0)));
    assert!(runtime::starts_with(&s("abc"), &s("a"), &n(-5.0)));
    assert!(runtime::ends_with(&s("abc"), &s("b"), &n(2.0)));
    assert!(runtime::ends_with(&s("abc"), &s("c"), &n(99.0)));
    assert!(!runtime::ends_with(&s("abc"), &s("a"), &n(-1.0)));
}

#[test]
fn replace_helper() {
    assert_eq!(runtime::replace(&s("hello world"), &s("o"), &s("0")), "hell0 world");
    assert_eq!(runtime::replace(&s("abc"), &s(""), &s("X")), "Xabc");
    assert_eq!(runtime::replace(&s("ab"), &s("a"), &s("$&")), "$&b");
}

#[test]
fn repeat_helper() {
    assert_eq!(runtime::repeat(&s("ab"), &n(3.0)), "ababab");
    assert_eq!(runtime::repeat(&s("ab"), &n(0.0)), "");
    assert_eq!(runtime::repeat(&s("ab"), &n(-2.0)), "");
    assert_eq!(runtime::repeat(&s("ab"), &n(2.9)), "abab");
}

#[test]
fn pad_start_pad_end() {
    assert_eq!(runtime::pad("42", &n(5.0), &s("0"), true), "00042");
    assert_eq!(runtime::pad("42", &n(5.0), &s("."), false), "42...");
    assert_eq!(runtime::pad("42", &n(5.0), &JsValue::Null, true), "   42");
    assert_eq!(runtime::pad("x", &n(5.0), &s("ab"), true), "ababx");
    assert_eq!(runtime::pad("hello", &n(3.0), &s("0"), true), "hello");
    assert_eq!(runtime::pad("42", &n(5.0), &s(""), true), "42");
    assert_eq!(runtime::pad("7", &n(4.9), &s("0"), true), "0007");
}

#[test]
fn sort_structured_comparator_dispatch() {
    let items = arr(vec![
        obj(&[("name", s("c")), ("price", n(30.0))]),
        obj(&[("name", s("a")), ("price", n(10.0))]),
        obj(&[("name", s("b")), ("price", n(20.0))]),
    ]);
    let asc_opts = obj(&[("keys", arr(vec![obj(&[("key_kind", s("field")), ("key", s("price")), ("compare_type", s("numeric")), ("direction", s("asc"))])]))]);
    assert_eq!(
        runtime::sort(&items, &asc_opts),
        arr(vec![obj(&[("name", s("a")), ("price", n(10.0))]), obj(&[("name", s("b")), ("price", n(20.0))]), obj(&[("name", s("c")), ("price", n(30.0))])])
    );

    let desc_opts = obj(&[("keys", arr(vec![obj(&[("key_kind", s("field")), ("key", s("price")), ("compare_type", s("numeric")), ("direction", s("desc"))])]))]);
    assert_eq!(
        runtime::sort(&items, &desc_opts),
        arr(vec![obj(&[("name", s("c")), ("price", n(30.0))]), obj(&[("name", s("b")), ("price", n(20.0))]), obj(&[("name", s("a")), ("price", n(10.0))])])
    );

    let self_opts = obj(&[("keys", arr(vec![obj(&[("key_kind", s("self")), ("compare_type", s("numeric")), ("direction", s("asc"))])]))]);
    assert_eq!(runtime::sort(&arr(vec![n(3.0), n(1.0), n(2.0)]), &self_opts), arr(vec![n(1.0), n(2.0), n(3.0)]));

    // Mutation isolation.
    let src = arr(vec![obj(&[("price", n(3.0))]), obj(&[("price", n(1.0))]), obj(&[("price", n(2.0))])]);
    let price_asc = obj(&[("keys", arr(vec![obj(&[("key_kind", s("field")), ("key", s("price")), ("compare_type", s("numeric")), ("direction", s("asc"))])]))]);
    let mut out = runtime::sort(&src, &price_asc);
    if let JsValue::Array(v) = &mut out {
        v.push(obj(&[("price", n(99.0))]));
    }
    assert_eq!(src, arr(vec![obj(&[("price", n(3.0))]), obj(&[("price", n(1.0))]), obj(&[("price", n(2.0))])]));

    assert_eq!(runtime::sort(&JsValue::Null, &self_opts), arr(vec![]));
    let field_no_ct = obj(&[("keys", arr(vec![obj(&[("key_kind", s("field")), ("key", s("price"))])]))]);
    assert_eq!(runtime::sort(&arr(vec![]), &field_no_ct), arr(vec![]));
}

#[test]
fn sort_multi_key_tie_break() {
    let items = arr(vec![
        obj(&[("p", n(1.0)), ("name", s("b"))]),
        obj(&[("p", n(1.0)), ("name", s("a"))]),
        obj(&[("p", n(0.0)), ("name", s("c"))]),
    ]);
    let opts = obj(&[(
        "keys",
        arr(vec![
            obj(&[("key_kind", s("field")), ("key", s("p")), ("compare_type", s("numeric")), ("direction", s("asc"))]),
            obj(&[("key_kind", s("field")), ("key", s("name")), ("compare_type", s("string")), ("direction", s("asc"))]),
        ]),
    )]);
    assert_eq!(
        runtime::sort(&items, &opts),
        arr(vec![obj(&[("p", n(0.0)), ("name", s("c"))]), obj(&[("p", n(1.0)), ("name", s("a"))]), obj(&[("p", n(1.0)), ("name", s("b"))])])
    );
}

#[test]
fn sort_auto_compare() {
    let opts = obj(&[("keys", arr(vec![obj(&[("key_kind", s("self")), ("compare_type", s("auto")), ("direction", s("asc"))])]))]);
    assert_eq!(runtime::sort(&arr(vec![n(3.0), n(1.0), n(2.0)]), &opts), arr(vec![n(1.0), n(2.0), n(3.0)]));
    assert_eq!(
        runtime::sort(&arr(vec![s("charlie"), s("alice"), s("bob")]), &opts),
        arr(vec![s("alice"), s("bob"), s("charlie")])
    );
}

// ---------------------------------------------------------------------------
// EvalDelegationTest -- verifies the `*_eval` JSON-string seam wiring the
// `call_method` dispatch uses, not just the underlying `evaluator`
// functions already tested directly in tests/evaluator.rs /
// tests/eval_vectors.rs.
// ---------------------------------------------------------------------------

#[test]
fn sort_eval_delegates_to_evaluator() {
    let cmp = json!({
        "kind": "binary", "op": "-",
        "left": {"kind": "member", "object": {"kind": "identifier", "name": "a"}, "property": "v"},
        "right": {"kind": "member", "object": {"kind": "identifier", "name": "b"}, "property": "v"},
    });
    let items = arr(vec![obj(&[("v", n(3.0))]), obj(&[("v", n(1.0))]), obj(&[("v", n(2.0))])]);
    let out = evaluator::sort_by_json(&items, &cmp.to_string(), "a", "b", &evaluator::Env::new()).unwrap();
    let vs: Vec<f64> = out.iter().map(|x| num::to_f64(&x.as_object().unwrap()["v"])).collect();
    assert_eq!(vs, vec![1.0, 2.0, 3.0]);
}

#[test]
fn reduce_eval_delegates_to_evaluator() {
    let body = json!({"kind": "binary", "op": "+", "left": {"kind": "identifier", "name": "acc"}, "right": {"kind": "identifier", "name": "item"}});
    let items = arr(vec![n(1.0), n(2.0), n(3.0)]);
    let out = evaluator::fold_json(&items, &body.to_string(), "acc", "item", n(0.0), "left", &evaluator::Env::new()).unwrap();
    assert_eq!(out, n(6.0));
}

#[test]
fn filter_every_some_find_eval_delegate_to_evaluator() {
    let pred = json!({
        "kind": "binary", "op": ">=",
        "left": {"kind": "member", "object": {"kind": "identifier", "name": "u"}, "property": "age"},
        "right": {"kind": "literal", "value": 18},
    });
    let pred_json = pred.to_string();
    let rows = arr(vec![obj(&[("age", n(15.0))]), obj(&[("age", n(30.0))]), obj(&[("age", n(18.0))])]);

    let filtered = evaluator::filter_json(&rows, &pred_json, "u", &evaluator::Env::new()).unwrap();
    let ages: Vec<f64> = filtered.iter().map(|r| num::to_f64(&r.as_object().unwrap()["age"])).collect();
    assert_eq!(ages, vec![30.0, 18.0]);

    assert!(!evaluator::every_json(&rows, &pred_json, "u", &evaluator::Env::new()).unwrap());
    assert!(evaluator::some_json(&rows, &pred_json, "u", &evaluator::Env::new()).unwrap());
    let found = evaluator::find_json(&rows, &pred_json, "u", true, &evaluator::Env::new()).unwrap();
    assert_eq!(num::to_f64(&found.as_object().unwrap()["age"]), 30.0);
    assert_eq!(evaluator::find_index_json(&rows, &pred_json, "u", false, &evaluator::Env::new()).unwrap(), 2);
}

#[test]
fn flat_map_eval_and_map_eval_delegate_to_evaluator() {
    let field_node = json!({"kind": "member", "object": {"kind": "identifier", "name": "i"}, "property": "tags"});
    let rows = arr(vec![obj(&[("tags", arr(vec![s("a"), s("b")]))]), obj(&[("tags", arr(vec![s("c")]))])]);
    let out = evaluator::flat_map_json(&rows, &field_node.to_string(), "i", &evaluator::Env::new()).unwrap();
    assert_eq!(out, vec![s("a"), s("b"), s("c")]);

    let name_field = json!({"kind": "member", "object": {"kind": "identifier", "name": "u"}, "property": "name"});
    let users = arr(vec![obj(&[("name", s("Ada"))]), obj(&[("name", s("Grace"))])]);
    let out = evaluator::map_json(&users, &name_field.to_string(), "u", &evaluator::Env::new()).unwrap();
    assert_eq!(out, vec![s("Ada"), s("Grace")]);
}
