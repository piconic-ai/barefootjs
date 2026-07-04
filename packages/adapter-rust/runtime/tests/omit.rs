//! `runtime::omit` -- the residual-object helper backing `bf.omit`, which
//! the minijinja adapter emits for an object-rest `.map()` destructure
//! binding whose rest is used (#2087 Phase B):
//!
//!   `{% set rest = bf.omit(item, ["id", "title"]) %}`
//!
//! Builds a TRUE residual object (every key of `item` NOT in the exclude
//! list) so a member read (`rest.flag`, native Jinja attribute access) and
//! the existing `{...rest}` spread emit (`bf.spread_attrs`) both see only
//! the non-destructured keys, matching the Hono/CSR IIFE
//! (`(({ id: __bfR0, title: __bfR1, ...__bfRest }) => __bfRest)(__bfItem())`).
//! No shared cross-adapter golden-vector entry exists for this helper (it is
//! new with #2087 and specific to the structural-destructure lowering, not
//! the `spec/template-helpers.md` catalogue `helper_vectors.rs` runs) -- this
//! file is this crate's own conformance pin, alongside `spread_attrs.rs`.

use barefootjs::num::JsValue;
use barefootjs::runtime;
use std::collections::BTreeMap;

fn obj(pairs: &[(&str, JsValue)]) -> JsValue {
    JsValue::Object(pairs.iter().map(|(k, v)| (k.to_string(), v.clone())).collect::<BTreeMap<_, _>>())
}

fn arr(items: &[&str]) -> JsValue {
    JsValue::Array(items.iter().map(|s| JsValue::from(*s)).collect())
}

fn s(v: &str) -> JsValue {
    JsValue::from(v)
}

fn run(recv: &JsValue, exclude: &JsValue) -> JsValue {
    runtime::omit(recv, exclude)
}

#[test]
fn excludes_listed_keys() {
    let item = obj(&[("id", s("t1")), ("title", s("one")), ("flag", s("a"))]);
    let out = run(&item, &arr(&["id", "title"]));
    assert_eq!(out, obj(&[("flag", s("a"))]));
}

#[test]
fn keeps_non_excluded_keys_including_non_identifier_names() {
    let item = obj(&[
        ("id", s("t1")),
        ("title", s("one")),
        ("data-priority", s("high")),
        ("tag", s("urgent")),
    ]);
    let out = run(&item, &arr(&["id", "title"]));
    assert_eq!(out, obj(&[("data-priority", s("high")), ("tag", s("urgent"))]));
}

#[test]
fn empty_exclude_returns_full_object() {
    let item = obj(&[("a", s("1")), ("b", s("2"))]);
    assert_eq!(run(&item, &arr(&[])), item);
}

#[test]
fn excluding_every_key_returns_empty_object() {
    let item = obj(&[("a", s("1")), ("b", s("2"))]);
    assert_eq!(run(&item, &arr(&["a", "b"])), obj(&[]));
}

#[test]
fn non_object_receiver_degrades_to_empty_object() {
    assert_eq!(run(&JsValue::Null, &arr(&["id"])), obj(&[]));
    assert_eq!(run(&s("not a hash"), &arr(&["id"])), obj(&[]));
    assert_eq!(run(&JsValue::Array(vec![s("a")]), &arr(&["id"])), obj(&[]));
}

#[test]
fn non_array_exclude_degrades_to_no_op_filter() {
    let item = obj(&[("a", s("1"))]);
    assert_eq!(run(&item, &JsValue::Null), item);
}
