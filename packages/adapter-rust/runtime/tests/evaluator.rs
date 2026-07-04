//! Hand-built ParsedExpr evaluator demonstrations, ported from
//! `packages/adapter-jinja/python/tests/test_evaluator.py` (itself a port
//! of `packages/adapter-perl/t/evaluator.t`).
//!
//! Mirrors the Go/Perl/Python demonstrations so all backends prove the SAME
//! restriction-lifting on the SAME shapes (a reducer/comparator/predicate
//! body the fixed bf_reduce/bf_sort/bf_filter catalogues can't express, but
//! the evaluator handles as just another pure expression).

use barefootjs::evaluator::{self, Env};
use barefootjs::num::JsValue;
use barefootjs::num::to_f64;
use serde_json::json;
use serde_json::Value as JsonValue;
use std::collections::BTreeMap;

fn nid(name: &str) -> JsonValue {
    json!({"kind": "identifier", "name": name})
}

fn nmem(object: JsonValue, property: &str) -> JsonValue {
    json!({"kind": "member", "object": object, "property": property, "computed": false})
}

fn nbin(op: &str, left: JsonValue, right: JsonValue) -> JsonValue {
    json!({"kind": "binary", "op": op, "left": left, "right": right})
}

fn nnum(value: f64) -> JsonValue {
    json!({"kind": "literal", "value": value, "literalType": "number"})
}

fn nstr(value: &str) -> JsonValue {
    json!({"kind": "literal", "value": value, "literalType": "string"})
}

fn ncall_math(func: &str, argument: JsonValue) -> JsonValue {
    json!({"kind": "call", "callee": nmem(nid("Math"), func), "args": [argument]})
}

fn nincludes(object: JsonValue, needle: JsonValue) -> JsonValue {
    json!({"kind": "array-method", "method": "includes", "object": object, "args": [needle]})
}

fn env_of(pairs: &[(&str, JsValue)]) -> Env {
    pairs.iter().map(|(k, v)| (k.to_string(), v.clone())).collect()
}

fn obj(pairs: &[(&str, JsValue)]) -> JsValue {
    JsValue::Object(pairs.iter().map(|(k, v)| (k.to_string(), v.clone())).collect::<BTreeMap<_, _>>())
}

fn num(n: f64) -> JsValue {
    JsValue::Number(n)
}

fn field(v: &JsValue, key: &str) -> JsValue {
    v.as_object().and_then(|m| m.get(key)).cloned().unwrap_or(JsValue::Null)
}

#[test]
fn fold_arbitrary_reducer_body() {
    // acc + item.price * item.qty
    let body = nbin("+", nid("acc"), nbin("*", nmem(nid("item"), "price"), nmem(nid("item"), "qty")));
    let items = JsValue::Array(vec![obj(&[("price", num(5.0)), ("qty", num(3.0))]), obj(&[("price", num(2.0)), ("qty", num(4.0))])]);
    let total = evaluator::fold(&items, &body, "acc", "item", num(0.0), "left", &Env::new());
    assert_eq!(total, num(23.0));
}

#[test]
fn fold_direction_observable_for_string_concat() {
    let body = nbin("+", nid("acc"), nid("item"));
    let items = JsValue::Array(vec![JsValue::from("a"), JsValue::from("b"), JsValue::from("c")]);
    assert_eq!(evaluator::fold(&items, &body, "acc", "item", JsValue::from(""), "left", &Env::new()), JsValue::from("abc"));
    assert_eq!(evaluator::fold(&items, &body, "acc", "item", JsValue::from(""), "right", &Env::new()), JsValue::from("cba"));
}

#[test]
fn sort_by_arbitrary_comparator_abs_of_field_difference() {
    let cmp = nbin("-", ncall_math("abs", nmem(nid("a"), "v")), ncall_math("abs", nmem(nid("b"), "v")));
    let items = JsValue::Array(vec![obj(&[("v", num(-5.0))]), obj(&[("v", num(3.0))]), obj(&[("v", num(-1.0))])]);
    let sorted = evaluator::sort_by(&items, &cmp, "a", "b", &Env::new());
    let vs: Vec<f64> = sorted.iter().map(|x| to_f64(&field(x, "v"))).collect();
    assert_eq!(vs, vec![-1.0, 3.0, -5.0]);
}

#[test]
fn sort_by_descending_via_reversed_comparator() {
    let cmp = nbin("-", nmem(nid("b"), "x"), nmem(nid("a"), "x"));
    let items = JsValue::Array(vec![obj(&[("x", num(10.0))]), obj(&[("x", num(30.0))]), obj(&[("x", num(20.0))])]);
    let sorted = evaluator::sort_by(&items, &cmp, "a", "b", &Env::new());
    let xs: Vec<f64> = sorted.iter().map(|x| to_f64(&field(x, "x"))).collect();
    assert_eq!(xs, vec![30.0, 20.0, 10.0]);
}

#[test]
fn nonfinite_division_and_js_stringification() {
    let div = |a: f64, b: f64| evaluator::evaluate(&nbin("/", nid("a"), nid("b")), &env_of(&[("a", num(a)), ("b", num(b))]));
    assert_eq!(div(1.0, 0.0), num(f64::INFINITY));
    assert_eq!(div(-1.0, 0.0), num(f64::NEG_INFINITY));
    assert!(matches!(div(0.0, 0.0), JsValue::Number(n) if n.is_nan()));

    assert_eq!(evaluator::to_string(&num(f64::INFINITY)), "Infinity");
    assert_eq!(evaluator::to_string(&num(f64::NEG_INFINITY)), "-Infinity");
    assert_eq!(evaluator::to_string(&num(f64::INFINITY - f64::INFINITY)), "NaN");
}

#[test]
fn captured_free_vars_via_base_env() {
    let body = nbin("+", nid("acc"), nbin("*", nid("item"), nid("factor")));
    let base_env = env_of(&[("factor", num(10.0))]);
    let items = JsValue::Array(vec![num(1.0), num(2.0), num(3.0)]);
    let total = evaluator::fold(&items, &body, "acc", "item", num(0.0), "left", &base_env);
    assert_eq!(total, num(60.0));

    let cmp = nbin("-", ncall_math("abs", nbin("-", nid("a"), nid("pivot"))), ncall_math("abs", nbin("-", nid("b"), nid("pivot"))));
    let pivot_env = env_of(&[("pivot", num(5.0))]);
    let sorted = evaluator::sort_by(&JsValue::Array(vec![num(1.0), num(8.0), num(4.0)]), &cmp, "a", "b", &pivot_env);
    assert_eq!(sorted, vec![num(4.0), num(8.0), num(1.0)]);
}

#[test]
fn boolean_valued_ops_return_real_booleans() {
    let lt = evaluator::evaluate(&nbin("<", nid("a"), nid("b")), &env_of(&[("a", num(1.0)), ("b", num(2.0))]));
    assert_eq!(lt, JsValue::Bool(true));
    assert_eq!(evaluator::to_string(&lt), "true");

    let cat = evaluator::evaluate(&nbin("+", nstr("x"), nbin("<", nid("a"), nid("b"))), &env_of(&[("a", num(1.0)), ("b", num(2.0))]));
    assert_eq!(cat, JsValue::from("xtrue"));

    let eq = evaluator::evaluate(&nbin("===", nid("a"), nid("b")), &env_of(&[("a", num(1.0)), ("b", num(1.0))]));
    assert!(matches!(eq, JsValue::Bool(_)));

    let not_ = evaluator::evaluate(&json!({"kind": "unary", "op": "!", "argument": nstr("")}), &Env::new());
    assert_eq!(evaluator::to_string(&not_), "true");

    let b = evaluator::evaluate(&json!({"kind": "call", "callee": nid("Boolean"), "args": [nstr("")]}), &Env::new());
    assert!(matches!(b, JsValue::Bool(_)));
    assert_eq!(evaluator::to_string(&b), "false");

    // `.length` is a string/array property only; a numeric scalar has none.
    let length = evaluator::evaluate(&nmem(nid("n"), "length"), &env_of(&[("n", num(123.0))]));
    assert_eq!(length, JsValue::Null);
}

#[test]
fn array_method_includes() {
    let tags = JsValue::Array(vec![JsValue::from("perl"), JsValue::from("go")]);
    let hit = evaluator::evaluate(&nincludes(nid("tags"), nstr("go")), &env_of(&[("tags", tags.clone())]));
    assert_eq!(hit, JsValue::Bool(true));

    let miss = evaluator::evaluate(&nincludes(nid("tags"), nstr("rust")), &env_of(&[("tags", tags)]));
    assert_eq!(miss, JsValue::Bool(false));

    // SameValueZero, not loose equality: the numeric element 2 matches the
    // numeric needle 2, but the string needle "2" (a different JS type)
    // does not -- mirroring `===`'s type-sensitivity.
    let nums = JsValue::Array(vec![num(1.0), num(2.0), num(3.0)]);
    let num_hit = evaluator::evaluate(&nincludes(nid("nums"), nnum(2.0)), &env_of(&[("nums", nums.clone())]));
    assert_eq!(num_hit, JsValue::Bool(true));
    let num_vs_string = evaluator::evaluate(&nincludes(nid("nums"), nstr("2")), &env_of(&[("nums", nums)]));
    assert_eq!(num_vs_string, JsValue::Bool(false));

    let sub = evaluator::evaluate(&nincludes(nid("name"), nstr("ar")), &env_of(&[("name", JsValue::from("bare"))]));
    assert_eq!(sub, JsValue::Bool(true));

    // A non-array, non-string receiver (number, null, object) is not a JS
    // `.includes` target; the evaluator degrades to false rather than
    // raising.
    let scalar_recv = evaluator::evaluate(&nincludes(nid("n"), nnum(1.0)), &env_of(&[("n", num(42.0))]));
    assert_eq!(scalar_recv, JsValue::Bool(false));
    let null_recv = evaluator::evaluate(&nincludes(nid("n"), nstr("x")), &env_of(&[("n", JsValue::Null)]));
    assert_eq!(null_recv, JsValue::Bool(false));
}

#[test]
fn sort_by_non_array_receiver_returns_empty_list() {
    let cmp = nbin("-", nid("a"), nid("b"));
    assert_eq!(evaluator::sort_by(&JsValue::Null, &cmp, "a", "b", &Env::new()), Vec::<JsValue>::new());
    assert_eq!(evaluator::sort_by(&num(42.0), &cmp, "a", "b", &Env::new()), Vec::<JsValue>::new());
}

#[test]
fn sort_by_is_stable_for_equal_keys() {
    let cmp = nbin("-", nmem(nid("a"), "k"), nmem(nid("b"), "k"));
    let items = JsValue::Array(vec![
        obj(&[("k", num(1.0)), ("id", JsValue::from("a"))]),
        obj(&[("k", num(1.0)), ("id", JsValue::from("b"))]),
        obj(&[("k", num(1.0)), ("id", JsValue::from("c"))]),
    ]);
    let sorted = evaluator::sort_by(&items, &cmp, "a", "b", &Env::new());
    let ids: Vec<String> = sorted.iter().map(|x| field(x, "id").as_str().unwrap().to_string()).collect();
    assert_eq!(ids, vec!["a", "b", "c"]);

    let mixed = JsValue::Array(vec![
        obj(&[("k", num(2.0)), ("id", JsValue::from("x"))]),
        obj(&[("k", num(1.0)), ("id", JsValue::from("y"))]),
        obj(&[("k", num(2.0)), ("id", JsValue::from("z"))]),
    ]);
    let sorted = evaluator::sort_by(&mixed, &cmp, "a", "b", &Env::new());
    let ids: Vec<String> = sorted.iter().map(|x| field(x, "id").as_str().unwrap().to_string()).collect();
    assert_eq!(ids, vec!["y", "x", "z"]);
}

#[test]
fn fold_json_and_sort_by_json_decode_and_evaluate() {
    let rows = JsValue::Array(vec![obj(&[("duration", num(95.0))]), obj(&[("duration", num(213.0))]), obj(&[("duration", num(185.0))])]);

    let reduce_body = nbin("+", nid("sum"), nmem(nid("t"), "duration")).to_string();
    let total = evaluator::fold_json(&rows, &reduce_body, "sum", "t", num(0.0), "left", &Env::new()).unwrap();
    assert_eq!(total, num(493.0));

    let labels = JsValue::Array(vec![obj(&[("label", JsValue::from("a"))]), obj(&[("label", JsValue::from("b"))]), obj(&[("label", JsValue::from("c"))])]);
    let concat_body = nbin("+", nid("acc"), nmem(nid("x"), "label")).to_string();
    assert_eq!(evaluator::fold_json(&labels, &concat_body, "acc", "x", JsValue::from(""), "left", &Env::new()).unwrap(), JsValue::from("abc"));
    assert_eq!(evaluator::fold_json(&labels, &concat_body, "acc", "x", JsValue::from(""), "right", &Env::new()).unwrap(), JsValue::from("cba"));

    let cmp_json = nbin("-", nmem(nid("a"), "duration"), nmem(nid("b"), "duration")).to_string();
    let sorted_rows = evaluator::sort_by_json(&rows, &cmp_json, "a", "b", &Env::new()).unwrap();
    let durations: Vec<f64> = sorted_rows.iter().map(|r| to_f64(&field(r, "duration"))).collect();
    assert_eq!(durations, vec![95.0, 185.0, 213.0]);
}

#[test]
fn filter_every_some_find_find_index_over_predicate() {
    let rows = JsValue::Array(vec![obj(&[("age", num(15.0))]), obj(&[("age", num(30.0))]), obj(&[("age", num(18.0))])]);
    let pred = nbin(">=", nmem(nid("u"), "age"), nnum(18.0));

    let f = evaluator::filter(&rows, &pred, "u", &Env::new());
    let ages: Vec<f64> = f.iter().map(|r| to_f64(&field(r, "age"))).collect();
    assert_eq!(ages, vec![30.0, 18.0]);

    assert!(evaluator::some(&rows, &pred, "u", &Env::new()));
    assert!(!evaluator::every(&rows, &pred, "u", &Env::new()));

    assert_eq!(to_f64(&field(&evaluator::find(&rows, &pred, "u", true, &Env::new()), "age")), 30.0);
    assert_eq!(to_f64(&field(&evaluator::find(&rows, &pred, "u", false, &Env::new()), "age")), 18.0);
    assert_eq!(evaluator::find_index(&rows, &pred, "u", true, &Env::new()), 1);
    assert_eq!(evaluator::find_index(&rows, &pred, "u", false, &Env::new()), 2);

    let empty = JsValue::Array(vec![]);
    assert!(evaluator::every(&empty, &pred, "u", &Env::new()));
    assert!(!evaluator::some(&empty, &pred, "u", &Env::new()));
    assert_eq!(evaluator::find(&empty, &pred, "u", true, &Env::new()), JsValue::Null);
    assert_eq!(evaluator::find_index(&empty, &pred, "u", true, &Env::new()), -1);

    let pred_json = pred.to_string();
    let fj = evaluator::filter_json(&rows, &pred_json, "u", &Env::new()).unwrap();
    let ages: Vec<f64> = fj.iter().map(|r| to_f64(&field(r, "age"))).collect();
    assert_eq!(ages, vec![30.0, 18.0]);
    assert!(!evaluator::every_json(&rows, &pred_json, "u", &Env::new()).unwrap());
    assert!(evaluator::some_json(&rows, &pred_json, "u", &Env::new()).unwrap());
    assert_eq!(to_f64(&field(&evaluator::find_json(&rows, &pred_json, "u", true, &Env::new()).unwrap(), "age")), 30.0);
    assert_eq!(evaluator::find_index_json(&rows, &pred_json, "u", false, &Env::new()).unwrap(), 2);

    let cap = nbin(">=", nmem(nid("u"), "age"), nid("threshold"));
    let hi = evaluator::filter(&rows, &cap, "u", &env_of(&[("threshold", num(18.0))]));
    let lo = evaluator::filter(&rows, &cap, "u", &env_of(&[("threshold", num(100.0))]));
    assert_eq!(hi.len(), 2);
    assert_eq!(lo.len(), 0);
    assert_eq!(evaluator::find_index(&rows, &cap, "u", true, &env_of(&[("threshold", num(100.0))])), -1);
}

#[test]
fn flat_map_projects_and_flattens_one_level() {
    let rows = JsValue::Array(vec![
        obj(&[("tags", JsValue::Array(vec![JsValue::from("a"), JsValue::from("b")]))]),
        obj(&[("tags", JsValue::Array(vec![JsValue::from("c")]))]),
    ]);
    let field_node = nmem(nid("i"), "tags");
    let out = evaluator::flat_map(&rows, &field_node, "i", &Env::new());
    assert_eq!(out, vec![JsValue::from("a"), JsValue::from("b"), JsValue::from("c")]);

    let pts = JsValue::Array(vec![obj(&[("x", num(1.0)), ("y", num(2.0))]), obj(&[("x", num(3.0)), ("y", num(4.0))])]);
    let tuple_proj = json!({"kind": "array-literal", "elements": [nmem(nid("p"), "x"), nmem(nid("p"), "y")]});
    let out = evaluator::flat_map(&pts, &tuple_proj, "p", &Env::new());
    assert_eq!(out, vec![num(1.0), num(2.0), num(3.0), num(4.0)]);

    let fj = evaluator::flat_map_json(&rows, &field_node.to_string(), "i", &Env::new()).unwrap();
    assert_eq!(fj, vec![JsValue::from("a"), JsValue::from("b"), JsValue::from("c")]);
}

#[test]
fn map_items_projects_one_result_per_element_no_flatten() {
    let tmpl = json!({
        "kind": "template-literal",
        "parts": [
            {"type": "string", "value": "#"},
            {"type": "expression", "expr": nid("t")},
        ],
    });
    let items = JsValue::Array(vec![JsValue::from("perl"), JsValue::from("go")]);
    assert_eq!(evaluator::map_items(&items, &tmpl, "t", &Env::new()), vec![JsValue::from("#perl"), JsValue::from("#go")]);

    let users = JsValue::Array(vec![obj(&[("name", JsValue::from("Ada"))]), obj(&[("name", JsValue::from("Grace"))])]);
    let field_node = nmem(nid("u"), "name");
    assert_eq!(evaluator::map_items(&users, &field_node, "u", &Env::new()), vec![JsValue::from("Ada"), JsValue::from("Grace")]);

    let rows = JsValue::Array(vec![obj(&[("tags", JsValue::Array(vec![JsValue::from("a"), JsValue::from("b")]))])]);
    assert_eq!(
        evaluator::map_items(&rows, &nmem(nid("i"), "tags"), "i", &Env::new()),
        vec![JsValue::Array(vec![JsValue::from("a"), JsValue::from("b")])]
    );

    let mj = evaluator::map_json(&users, &field_node.to_string(), "u", &Env::new()).unwrap();
    assert_eq!(mj, vec![JsValue::from("Ada"), JsValue::from("Grace")]);
}

#[test]
fn nested_map_and_filter_inside_a_callback_body() {
    // p => p.tags.map(t => '#' + t) -- the #1938 blog-showcase flatMap
    // projection shape: the projection body itself contains a `.map` call.
    let tags = JsValue::Array(vec![JsValue::from("go"), JsValue::from("perl")]);
    let post = obj(&[("tags", tags)]);
    let nested_map = json!({
        "kind": "call",
        "callee": {"kind": "member", "object": nmem(nid("p"), "tags"), "property": "map", "computed": false},
        "args": [{
            "kind": "arrow",
            "params": ["t"],
            "body": nbin("+", nstr("#"), nid("t")),
        }],
    });
    let out = evaluator::evaluate(&nested_map, &env_of(&[("p", post.clone())]));
    assert_eq!(out, JsValue::Array(vec![JsValue::from("#go"), JsValue::from("#perl")]));

    // i => i.tags.filter(t => t !== 'x') -- nested .filter.
    let tags2 = JsValue::Array(vec![JsValue::from("a"), JsValue::from("x"), JsValue::from("b")]);
    let item = obj(&[("tags", tags2)]);
    let nested_filter = json!({
        "kind": "call",
        "callee": {"kind": "member", "object": nmem(nid("i"), "tags"), "property": "filter", "computed": false},
        "args": [{
            "kind": "arrow",
            "params": ["t"],
            "body": {"kind": "binary", "op": "!==", "left": nid("t"), "right": nstr("x")},
        }],
    });
    let out = evaluator::evaluate(&nested_filter, &env_of(&[("i", item)]));
    assert_eq!(out, JsValue::Array(vec![JsValue::from("a"), JsValue::from("b")]));

    // A 2-param arrow (value, index).
    let nested_map_idx = json!({
        "kind": "call",
        "callee": {"kind": "member", "object": nid("xs"), "property": "map", "computed": false},
        "args": [{
            "kind": "arrow",
            "params": ["t", "idx"],
            "body": nbin("+", nid("t"), nid("idx")),
        }],
    });
    let xs = JsValue::Array(vec![num(10.0), num(20.0), num(30.0)]);
    let out = evaluator::evaluate(&nested_map_idx, &env_of(&[("xs", xs)]));
    assert_eq!(out, JsValue::Array(vec![num(10.0), num(21.0), num(32.0)]));

    // Non-array receiver -> null (mirrors Go's `toAnySlice(nil)` short-circuit).
    let scalar_recv = json!({
        "kind": "call",
        "callee": {"kind": "member", "object": nid("n"), "property": "map", "computed": false},
        "args": [{"kind": "arrow", "params": ["t"], "body": nid("t")}],
    });
    assert_eq!(evaluator::evaluate(&scalar_recv, &env_of(&[("n", num(42.0))])), JsValue::Null);
}

#[test]
fn array_method_join() {
    let njoin = |object: JsonValue, args: Vec<JsonValue>| json!({"kind": "array-method", "method": "join", "object": object, "args": args});

    let tags = JsValue::Array(vec![JsValue::from("a"), JsValue::from("b"), JsValue::from("c")]);
    let custom_sep = evaluator::evaluate(&njoin(nid("tags"), vec![nstr("-")]), &env_of(&[("tags", tags.clone())]));
    assert_eq!(custom_sep, JsValue::from("a-b-c"));

    let default_sep = evaluator::evaluate(&njoin(nid("tags"), vec![]), &env_of(&[("tags", tags)]));
    assert_eq!(default_sep, JsValue::from("a,b,c"));

    let empty = evaluator::evaluate(&njoin(nid("tags"), vec![nstr(",")]), &env_of(&[("tags", JsValue::Array(vec![]))]));
    assert_eq!(empty, JsValue::from(""));

    // A null element joins as '' -- not the literal string "null".
    let with_null = JsValue::Array(vec![JsValue::from("a"), JsValue::Null, JsValue::from("b")]);
    let joined = evaluator::evaluate(&njoin(nid("tags"), vec![nstr(",")]), &env_of(&[("tags", with_null)]));
    assert_eq!(joined, JsValue::from("a,,b"));

    // Composed: doubly-nested .map + .join (the #1938 blog-showcase shape).
    let posts = JsValue::Array(vec![
        obj(&[("tags", JsValue::Array(vec![JsValue::from("a"), JsValue::from("b")]))]),
        obj(&[("tags", JsValue::Array(vec![JsValue::from("c")]))]),
    ]);
    let inner_map_join = njoin(
        json!({
            "kind": "call",
            "callee": {"kind": "member", "object": nmem(nid("p"), "tags"), "property": "map", "computed": false},
            "args": [{"kind": "arrow", "params": ["t"], "body": nbin("+", nstr("#"), nid("t"))}],
        }),
        vec![nstr(" ")],
    );
    let outer = njoin(
        json!({
            "kind": "call",
            "callee": {"kind": "member", "object": nid("posts"), "property": "map", "computed": false},
            "args": [{"kind": "arrow", "params": ["p"], "body": inner_map_join}],
        }),
        vec![nstr(", ")],
    );
    let out = evaluator::evaluate(&outer, &env_of(&[("posts", posts)]));
    assert_eq!(out, JsValue::from("#a #b, #c"));
}
