//! JS `undefined` as a value (spec/js-undefined-value.md, rollout step U3).
//!
//! `JsValue::Undefined` is minijinja's own undefined; `JsValue::Null` (host
//! nil, `none`) is JS `null`. These pin the parts the golden vectors do not
//! reach: the engine's view of the value, the template spellings the
//! adapter emits (`bf.undefined`, `bf.is_*`), the JSON walk the `bf-p`
//! writer shares with `bf.json`, the helpers' optional-argument defaults, the
//! seed `render_child` applies, and `Opt<T>`.

use barefootjs::num::JsValue;
use barefootjs::runtime::{self, ChildRendererSpec};
use barefootjs::{backend_minijinja, evaluator, BfInstance, Opt, RenderSession, SearchParams};
use minijinja::value::Value as MjValue;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::Arc;

const U: JsValue = JsValue::Undefined;
const N: JsValue = JsValue::Null;

fn s(v: &str) -> JsValue {
    JsValue::String(v.to_string())
}

fn n(v: f64) -> JsValue {
    JsValue::Number(v)
}

fn arr(items: Vec<JsValue>) -> JsValue {
    JsValue::Array(items)
}

fn obj(pairs: Vec<(&str, JsValue)>) -> JsValue {
    JsValue::Object(pairs.into_iter().map(|(k, v)| (k.to_string(), v)).collect())
}

struct TempDir(PathBuf);

impl TempDir {
    fn new(tag: &str) -> TempDir {
        let dir = std::env::temp_dir().join(format!(
            "bf-undefined-test-{tag}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        TempDir(dir)
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        std::fs::remove_dir_all(&self.0).ok();
    }
}

/// Render `src` with `bf` bound and `vars` as the template vars, through
/// the runtime's own Environment (formatter, undefined behavior).
fn render(src: &str, vars: JsValue) -> String {
    let dir = TempDir::new("render");
    std::fs::write(dir.0.join("t.j2"), src).unwrap();
    let env = backend_minijinja::build_environment(&dir.0);
    let root = BfInstance::root(RenderSession::new(), "test");
    backend_minijinja::render_named(&env, "t", root.as_mj_value(), &vars).unwrap()
}

#[test]
fn minijinja_undefined_round_trips_as_js_undefined() {
    assert_eq!(runtime::mj_to_js(&MjValue::UNDEFINED), U);
    assert_eq!(runtime::mj_to_js(&MjValue::from(())), N);
    assert!(runtime::js_to_mj(&U).is_undefined());
    assert!(runtime::js_to_mj(&N).is_none());
}

#[test]
fn predicates() {
    assert!(U.is_undefined() && !U.is_null() && U.is_nullish());
    assert!(!N.is_undefined() && N.is_null() && N.is_nullish());
    for v in [n(0.0), s(""), JsValue::Bool(false), arr(vec![]), obj(vec![])] {
        assert!(!v.is_nullish());
    }
}

#[test]
fn templates_spell_undefined_and_the_nil_tests() {
    // A never-set var and `bf.undefined` are JS `undefined`; `none` is null.
    let out = render(
        "{{ bf.is_undefined(x) }}|{{ bf.is_null(x) }}|{{ bf.is_nullish(x) }}|{{ bf.is_undefined(bf.undefined) }}|{{ bf.is_null(none) }}|{{ bf.is_undefined(none) }}",
        obj(vec![]),
    );
    assert_eq!(out, "true|false|true|true|true|false");
    let out = render("{{ bf.is_undefined(x) }}|{{ bf.is_null(x) }}|{{ bf.is_undefined(y) }}", obj(vec![("x", N), ("y", U)]));
    assert_eq!(out, "false|true|true");
}

#[test]
fn the_engine_sees_undefined_as_neither_defined_nor_none() {
    let out = render(
        "[{{ u }}]{{ u is defined }}{{ u is none }}{% if u %}T{% else %}F{% endif %}{{ u.a['b'] is defined }}",
        obj(vec![("u", U)]),
    );
    assert_eq!(out, "[]falsefalseFfalse");
    // `?? d` (`bf.keep_nonnil`) coalesces both nils.
    let out = render("{{ (bf.keep_nonnil(u) or ['d'])[0] }}{{ (bf.keep_nonnil(z) or ['d'])[0] }}{{ (bf.keep_nonnil(0) or ['d'])[0] }}", obj(vec![("u", U), ("z", N)]));
    assert_eq!(out, "dd0");
}

#[test]
fn json_follows_json_stringify() {
    let enc = backend_minijinja::encode_json;
    assert_eq!(enc(&obj(vec![("a", N), ("b", U)])), r#"{"a":null}"#);
    assert_eq!(enc(&arr(vec![U, N, n(1.0)])), "[null,null,1]");
    assert_eq!(enc(&obj(vec![("o", obj(vec![("b", U)]))])), r#"{"o":{}}"#);
    assert_eq!(enc(&obj(vec![("a", U), ("b", n(2.0)), ("c", U)])), r#"{"b":2}"#);
    assert_eq!(obj(vec![("a", U), ("b", arr(vec![U]))]).to_json(), json!({"b": [null]}));
    // A top-level `undefined` gives no string: `bf.json` is undefined itself,
    // which prints nothing.
    assert_eq!(render("[{{ bf.json(u) }}][{{ bf.json([bf.undefined, none]) }}]", obj(vec![("u", U)])), "[][[null,null]]");
}

#[test]
fn bf_p_drops_an_undefined_prop() {
    let mut root = BfInstance::root(RenderSession::new(), "test");
    root.props = Some(obj(vec![("a", N), ("b", U), ("c", arr(vec![U]))]));
    let dir = TempDir::new("bfp");
    std::fs::write(dir.0.join("t.j2"), "{{ bf.props_attr() }}").unwrap();
    let env = backend_minijinja::build_environment(&dir.0);
    let out = backend_minijinja::render_named(&env, "t", root.as_mj_value(), &obj(vec![])).unwrap();
    assert_eq!(out, " bf-p='{&#34;a&#34;:null,&#34;c&#34;:[null]}'");
}

#[test]
fn coercions_tell_the_nils_apart() {
    assert_eq!(runtime::js_to_string(&U), "undefined");
    assert_eq!(runtime::js_to_string(&N), "null");
    assert_eq!(runtime::js_plus(&U, &s("x")), s("undefinedx"));
    assert!(runtime::js_to_number(&U).is_nan());
    assert_eq!(runtime::js_to_number(&N), 0.0);
    assert_eq!(runtime::js_sub(&N, &n(1.0)), n(-1.0));
    assert!(matches!(runtime::js_mul(&U, &n(2.0)), JsValue::Number(x) if x.is_nan()));
    assert!(!runtime::js_strict_eq(&U, &N));
    assert!(runtime::js_strict_eq(&U, &U));
    assert!(!runtime::js_relational("<=", &U, &n(0.0)));
    assert!(runtime::js_relational("<=", &N, &n(0.0)));
    // The display helpers render both nils as "" / NaN.
    assert_eq!(runtime::js_string(&U), "");
    assert_eq!(runtime::js_string(&N), "");
    assert!(runtime::js_number(&U).is_nan());
    // The `Math` helpers and `/` apply JS ToNumber.
    assert_eq!(render("{{ bf.floor(z) }}|{{ bf.floor(u) }}|{{ bf.div(z, 2) }}|{{ bf.sub(z, 1) }}", obj(vec![("z", N), ("u", U)])), "0|NaN|0|-1");
}

#[test]
fn reads_that_miss_are_undefined() {
    assert_eq!(runtime::js_get(&obj(vec![("a", n(1.0))]), &s("b")), U);
    assert_eq!(runtime::js_get(&arr(vec![n(1.0)]), &n(5.0)), U);
    assert_eq!(runtime::js_get(&obj(vec![("a", N)]), &s("a")), N);
    assert_eq!(runtime::at(&arr(vec![n(1.0)]), &n(5.0)), U);
    assert_eq!(runtime::find(&arr(vec![n(1.0)]), |_| false), U);
    assert_eq!(render("{{ bf.is_undefined(bf.length({})) }}", obj(vec![])), "true");
}

#[test]
fn array_search_uses_strict_equality() {
    assert!(runtime::includes(&arr(vec![U]), &U));
    assert!(!runtime::includes(&arr(vec![N]), &U));
    assert!(!runtime::includes(&arr(vec![U]), &N));
    assert_eq!(runtime::index_of(&arr(vec![N, U]), &U, false), 1);
    assert_eq!(runtime::index_of(&arr(vec![U, N]), &N, false), 1);
    // A string receiver ToString's its needle.
    assert!(runtime::includes(&s("aundefinedb"), &U));
    assert!(runtime::includes(&s("anullb"), &N));
    assert!(!runtime::includes(&s("ab"), &N));
    assert_eq!(runtime::index_of(&s("xundefined"), &U, false), 1);
}

#[test]
fn join_prints_both_nils_empty() {
    assert_eq!(runtime::join(&arr(vec![N, U, n(1.0)]), &U), ",,1");
    assert_eq!(runtime::join(&arr(vec![n(1.0), n(2.0)]), &U), "1,2");
    assert_eq!(runtime::join(&arr(vec![n(1.0), n(2.0)]), &N), "1null2");
}

#[test]
fn sort_puts_undefined_last() {
    let items = arr(vec![n(3.0), U, n(1.0), N, n(2.0)]);
    let want = arr(vec![N, n(1.0), n(2.0), n(3.0), U]);
    let keys = obj(vec![("keys", arr(vec![obj(vec![("key_kind", s("self")), ("compare_type", s("numeric")), ("direction", s("asc"))])]))]);
    assert_eq!(runtime::sort(&items, &keys), want);
    let cmp = json!({"kind": "binary", "op": "-", "left": {"kind": "identifier", "name": "a"}, "right": {"kind": "identifier", "name": "b"}});
    assert_eq!(JsValue::Array(evaluator::sort_by(&items, &cmp, "a", "b", &evaluator::Env::new())), want);
}

#[test]
fn optional_argument_defaults_apply_to_undefined_only() {
    // Omitted or `undefined` takes the JS default; `null` is coerced.
    let abc = arr(vec![n(1.0), n(2.0), n(3.0)]);
    assert_eq!(runtime::slice(&abc, &n(1.0), &U), arr(vec![n(2.0), n(3.0)]));
    assert_eq!(runtime::slice(&abc, &n(1.0), &N), arr(vec![]));
    assert_eq!(runtime::pad("abc", &n(5.0), &U, true), "  abc");
    assert_eq!(runtime::pad("abc", &n(5.0), &N, true), "nuabc");
    assert_eq!(runtime::split(&s("a,b"), &U, &U), arr(vec![s("a,b")]));
    assert_eq!(runtime::split(&s("anullb"), &N, &U), arr(vec![s("a"), s("b")]));
    assert_eq!(runtime::split(&s("a,b"), &s(","), &N), arr(vec![]));
    assert_eq!(runtime::split(&s("a,b"), &s(","), &U), arr(vec![s("a"), s("b")]));
    assert!(runtime::ends_with(&s("abc"), &s("c"), &U));
    assert!(runtime::ends_with(&s("abc"), &s(""), &N));
    assert!(!runtime::ends_with(&s("abc"), &s("c"), &N));
    assert_eq!(runtime::at(&arr(vec![n(7.0), n(8.0)]), &U), n(7.0));
    assert_eq!(runtime::at(&arr(vec![n(7.0), n(8.0)]), &N), n(7.0));
    assert_eq!(runtime::to_fixed(&n(1.25), &U), "1");
    assert_eq!(runtime::repeat(&s("ab"), &N), "");
    // A template's omitted argument is `undefined` too.
    assert_eq!(render("{{ bf.json(bf.slice([1, 2, 3], 1)) }}|{{ bf.join(['a', 'b']) }}|{{ bf.join(bf.split('a,b', ','), '+') }}", obj(vec![])), "[2,3]|a,b|a+b");
}

#[test]
fn search_params_get_of_an_absent_key_is_null() {
    let dir = TempDir::new("sp");
    std::fs::write(dir.0.join("t.j2"), "{{ bf.is_null(searchParams.get('b')) }}").unwrap();
    let env = backend_minijinja::build_environment(&dir.0);
    let root = BfInstance::root(RenderSession::new(), "test");
    let extra = vec![("searchParams".to_string(), SearchParams::new("a=1").to_value())];
    let out = backend_minijinja::render_entry(&env, "t", root.as_mj_value(), &obj(vec![]), &extra).unwrap();
    assert_eq!(out, "true");
}

#[test]
fn evaluator_reads() {
    let env = evaluator::Env::new();
    assert_eq!(evaluator::evaluate(&json!({"kind": "identifier", "name": "undefined"}), &env), U);
    let missing = json!({"kind": "member", "object": {"kind": "identifier", "name": "o"}, "property": "x", "computed": false});
    let with = |o: JsValue| -> evaluator::Env { [("o".to_string(), o)].into_iter().collect() };
    assert_eq!(evaluator::evaluate(&missing, &with(obj(vec![]))), U);
    let coalesce = json!({"kind": "logical", "op": "??", "left": missing, "right": {"kind": "literal", "value": "d", "literalType": "string"}});
    assert_eq!(evaluator::evaluate(&coalesce, &with(obj(vec![]))), s("d"));
    assert_eq!(evaluator::evaluate(&coalesce, &with(obj(vec![("x", N)]))), s("d"));
}

/// `String()` / `Number()` with no argument are `""` / `0`, while an explicit
/// `undefined` argument is `"undefined"` / NaN.
#[test]
fn string_and_number_with_no_argument() {
    let env = evaluator::Env::new();
    let call = |name: &str, args: serde_json::Value| {
        evaluator::evaluate(&json!({"kind": "call", "callee": {"kind": "identifier", "name": name}, "args": args}), &env)
    };
    let undef_arg = json!([{"kind": "identifier", "name": "undefined"}]);
    assert_eq!(call("Number", json!([])), n(0.0));
    assert_eq!(call("String", json!([])), s(""));
    assert!(matches!(call("Number", undef_arg.clone()), JsValue::Number(v) if v.is_nan()));
    assert_eq!(call("String", undef_arg), s("undefined"));
}

/// `render_child` seeds the child's vars the way
/// `derive_stash_from_defaults` does (decision 6): an absent or `undefined`
/// prop takes its default, or undefined without one; a present `none` keeps
/// JS `null`.
#[test]
fn render_child_seeds_undefined_and_keeps_null() {
    let dir = TempDir::new("child");
    std::fs::write(
        dir.0.join("parent.j2"),
        "{{ bf.render_child('child', {}) }}|{{ bf.render_child('child', {'v': none, 'n': none}) }}|{{ bf.render_child('child', {'v': bf.undefined}) }}",
    )
    .unwrap();
    std::fs::write(dir.0.join("child.j2"), "{{ bf.to_string(v) }}/{{ bf.to_string(n) }}").unwrap();
    let session = RenderSession::new();
    let defaults = obj(vec![
        ("v", obj(vec![("propName", s("v")), ("value", s("D"))])),
        ("n", obj(vec![("propName", s("n"))])),
    ]);
    session.register_child_renderer(
        "child".to_string(),
        ChildRendererSpec {
            component_name: "Child".to_string(),
            template: "child".to_string(),
            ssr_defaults: defaults,
            rest_props_name: None,
            param_names: vec!["v".to_string(), "n".to_string()],
        },
    );
    let env = backend_minijinja::build_environment(&dir.0);
    let root = BfInstance::root(Arc::clone(&session), "test");
    let out = backend_minijinja::render_named(&env, "parent", root.as_mj_value(), &obj(vec![])).unwrap();
    assert_eq!(out, "D/undefined|null/null|D/undefined");
}

#[derive(Serialize, Deserialize, Default, Debug, PartialEq)]
struct ChipProps {
    label: String,
    #[serde(default, skip_serializing_if = "Opt::is_omitted")]
    c: Opt<String>,
    #[serde(default, skip_serializing_if = "Opt::is_omitted")]
    n: Opt<f64>,
}

#[test]
fn opt_keeps_the_four_presence_states() {
    let absent: ChipProps = serde_json::from_str(r#"{"label":"x"}"#).unwrap();
    assert_eq!(absent.c, Opt::Absent);
    let null: ChipProps = serde_json::from_str(r#"{"label":"x","c":null}"#).unwrap();
    assert_eq!(null.c, Opt::Null);
    let set: ChipProps = serde_json::from_str(r#"{"label":"x","c":"p","n":2}"#).unwrap();
    assert_eq!(set.c, Opt::Some("p".to_string()));
    assert_eq!(set.n, Opt::Some(2.0));

    // Absent and undefined are dropped, as `JSON.stringify` drops an
    // `undefined` member; `null` is written.
    assert_eq!(serde_json::to_string(&absent).unwrap(), r#"{"label":"x"}"#);
    assert_eq!(serde_json::to_string(&ChipProps { c: Opt::Undefined, ..ChipProps::default() }).unwrap(), r#"{"label":""}"#);
    assert_eq!(serde_json::to_string(&null).unwrap(), r#"{"label":"x","c":null}"#);
    assert_eq!(serde_json::to_string(&vec![Opt::<i32>::Undefined, Opt::Some(1)]).unwrap(), "[null,1]");

    // Into a props map: absent leaves the key out.
    let mut props = BTreeMap::new();
    Opt::<String>::Absent.insert_into(&mut props, "a");
    Opt::<String>::Undefined.insert_into(&mut props, "u");
    Opt::<String>::Null.insert_into(&mut props, "z");
    Opt::Some("v".to_string()).insert_into(&mut props, "s");
    assert_eq!(JsValue::Object(props), obj(vec![("u", U), ("z", N), ("s", s("v"))]));

    assert!(!Opt::<i32>::Absent.passed());
    assert!(Opt::<i32>::Absent.forward().passed());
    assert_eq!(Opt::<i32>::Absent.forward(), Opt::Undefined);
    assert_eq!(Opt::from(None::<i32>), Opt::Null);
}
