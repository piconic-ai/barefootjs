//! `runtime::spread_attrs` -- ported from
//! `packages/adapter-jinja/python/tests/test_spread_attrs.py` (itself a
//! port of `packages/adapter-perl/t/spread_attrs.t`).
//!
//! JSX intrinsic-element spread runtime helper (#1407 follow-up). Mirrors
//! the JS `spreadAttrs` runtime and the Go/Perl/Python adapters'
//! equivalents so SSR output stays byte-equal across every adapter --
//! cross-adapter parity regressions surface here first.

use barefootjs::num::JsValue;
use barefootjs::runtime;
use std::collections::BTreeMap;

fn obj(pairs: &[(&str, JsValue)]) -> JsValue {
    JsValue::Object(pairs.iter().map(|(k, v)| (k.to_string(), v.clone())).collect::<BTreeMap<_, _>>())
}

fn s(v: &str) -> JsValue {
    JsValue::from(v)
}

fn run(bag: &JsValue) -> String {
    runtime::spread_attrs(bag)
}

#[test]
fn basic_shapes() {
    assert_eq!(run(&JsValue::Null), "");
    assert_eq!(run(&obj(&[])), "");
    assert_eq!(run(&s("not a hash")), "");
    assert_eq!(run(&obj(&[("id", s("a"))])), "id=\"a\"");
}

#[test]
fn alphabetic_key_order() {
    assert_eq!(run(&obj(&[("id", s("a")), ("class", s("on"))])), "class=\"on\" id=\"a\"");
}

#[test]
fn key_remapping() {
    assert_eq!(run(&obj(&[("className", s("foo"))])), "class=\"foo\"");
    assert_eq!(run(&obj(&[("htmlFor", s("x"))])), "for=\"x\"");
    assert_eq!(run(&obj(&[("dataPriority", s("high"))])), "data-priority=\"high\"");
    // SVG XML attrs are case-sensitive -- preserve verbatim.
    assert_eq!(run(&obj(&[("viewBox", s("0 0 10 10"))])), "viewBox=\"0 0 10 10\"");
    assert_eq!(run(&obj(&[("clipPathUnits", s("userSpaceOnUse"))])), "clipPathUnits=\"userSpaceOnUse\"");
    // JS-reference parity (#1411): a leading uppercase letter emits a
    // leading dash.
    assert_eq!(run(&obj(&[("XData", s("x"))])), "-x-data=\"x\"");
}

#[test]
fn event_handlers_js_predicate_parity() {
    assert_eq!(run(&obj(&[("onClick", s("fn")), ("id", s("a"))])), "id=\"a\"");
    assert_eq!(run(&obj(&[("on_custom", s("fn")), ("id", s("a"))])), "id=\"a\"");
    assert_eq!(run(&obj(&[("on0", s("fn")), ("id", s("a"))])), "id=\"a\"");
    assert_eq!(run(&obj(&[("oncology", s("x"))])), "oncology=\"x\"");
}

#[test]
fn children_skipped_ref_passed_through() {
    assert_eq!(run(&obj(&[("children", s("x")), ("id", s("a"))])), "id=\"a\"");
    // JS `spreadAttrs` does NOT filter `ref` (`applyRestAttrs` does --
    // that's a separate divergence).
    assert_eq!(run(&obj(&[("ref", s("x")), ("id", s("a"))])), "id=\"a\" ref=\"x\"");
}

#[test]
fn boolean_values() {
    assert_eq!(run(&obj(&[("hidden", JsValue::Bool(true)), ("id", s("a"))])), "hidden id=\"a\"");
    assert_eq!(run(&obj(&[("hidden", JsValue::Bool(false)), ("id", s("a"))])), "id=\"a\"");
    // Plain numeric 0 renders as a value (matches `tabindex="0"`).
    assert_eq!(run(&obj(&[("tabindex", JsValue::Number(0.0))])), "tabindex=\"0\"");
}

#[test]
fn nullish_skip() {
    assert_eq!(run(&obj(&[("a", JsValue::Null), ("b", s("x"))])), "b=\"x\"");
}

#[test]
fn html_escape() {
    assert_eq!(run(&obj(&[("title", s("<b>\"x\"</b>"))])), "title=\"&lt;b&gt;&#34;x&#34;&lt;/b&gt;\"");
    assert_eq!(run(&obj(&[("alt", s("tom & jerry"))])), "alt=\"tom &amp; jerry\"");
}

#[test]
fn style_object_lowering() {
    assert_eq!(
        run(&obj(&[("style", obj(&[("backgroundColor", s("red")), ("color", s("white"))]))])),
        "style=\"background-color:red;color:white\""
    );
    assert_eq!(run(&obj(&[("style", s("color:red"))])), "style=\"color:red\"");
}
