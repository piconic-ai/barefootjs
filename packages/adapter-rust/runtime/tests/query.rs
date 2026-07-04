//! `runtime::query` -- ported from
//! `packages/adapter-jinja/python/tests/test_query.py` (itself a port of
//! `packages/adapter-perl/t/query.t`).
//!
//! The full CROSS-BACKEND behaviour (control flow + form-encoding parity
//! with the browser's `URLSearchParams`) is defined ONCE in the shared
//! golden helper vectors and run by `tests/helper_vectors.rs`. This file
//! keeps a few representative cases for always-on coverage plus a
//! Rust-runtime-specific defensive case the golden vectors can't express: a
//! `null` value (JSON has no `undefined`; a JSON `null` stringifies to
//! `"null"` under JS `String()`, so it can't be a shared vector -- this
//! runtime coerces `null` to `''` and omits the empty pair, mirroring the
//! Perl/Python ports' documented `undef`/`None` handling).

use barefootjs::num::JsValue;
use barefootjs::runtime;

fn s(v: &str) -> JsValue {
    JsValue::from(v)
}
fn b(v: bool) -> JsValue {
    JsValue::Bool(v)
}

#[test]
fn order_preserved_repeated_key_overwrites_at_first_position() {
    let triples = [b(true), s("sort"), s("title"), b(true), s("tag"), s("go"), b(true), s("sort"), s("date")];
    assert_eq!(runtime::query(&s("/blog"), &triples), "/blog?sort=date&tag=go");
}

#[test]
fn form_encoding_tilde_star_space() {
    let triples = [b(true), s("t"), s("a~b *c")];
    assert_eq!(runtime::query(&s("/s"), &triples), "/s?t=a%7Eb+*c");
}

#[test]
fn array_value_appends_pair_per_nonempty_member() {
    let triples = [b(true), s("tag"), JsValue::Array(vec![s("a"), s(""), s("b")])];
    assert_eq!(runtime::query(&s("/list"), &triples), "/list?tag=a&tag=b");
}

#[test]
fn none_value_coerced_to_empty_and_omitted() {
    let triples = [b(true), s("tag"), JsValue::Null];
    assert_eq!(runtime::query(&s("/list"), &triples), "/list");

    let triples2 = [b(true), s("tag"), JsValue::Null, b(true), s("keep"), s("me")];
    assert_eq!(runtime::query(&s("/list"), &triples2), "/list?keep=me");
}
