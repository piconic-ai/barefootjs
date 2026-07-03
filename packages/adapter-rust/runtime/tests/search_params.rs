//! `barefootjs::SearchParams` -- Rust-specific concerns, ported from
//! `packages/adapter-jinja/python/tests/test_search_params.py` (itself a
//! port of `packages/adapter-perl/t/search_params.t`).
//!
//! The cross-language VALUE semantics of `get` are owned by the
//! language-independent golden vectors (`search_params_get` in
//! `tests/helper_vectors.rs`), so Go/Perl/Python/Rust parity there is
//! mechanical. This file covers only what those value vectors can't: the
//! constructor seam, lenient parsing (never panics), and UTF-8 decoding.
//! (Mirrors `src/search_params.rs`'s inline `#[cfg(test)]` module -- kept
//! as its own top-level file too, per the design doc's file layout, since
//! it is the direct structural port of the Python test module.)

use barefootjs::SearchParams;

#[test]
fn constructor_and_get() {
    let sp = SearchParams::new("sort=price");
    assert_eq!(sp.get("sort"), Some("price"));
    assert_eq!(SearchParams::new("").get("sort"), None);
}

#[test]
fn none_composition_coalesces_only_none() {
    // The adapters lower `searchParams().get(k) ?? d` to a minijinja
    // expression that coalesces only an absent key (not a bare `or`,
    // which would also default a present-but-empty value) -- so an
    // absent key falls back to the author's default while a
    // present-but-empty value keeps ''.
    let absent = SearchParams::new("other=x");
    assert_eq!(absent.get("sort").unwrap_or("none"), "none");

    let empty = SearchParams::new("sort=");
    assert_eq!(empty.get("sort").unwrap_or("none"), "");
}

#[test]
fn utf8_percent_decoding() {
    let sp = SearchParams::new("q=%E2%9C%93");
    assert_eq!(sp.get("q"), Some("\u{2713}"));
}

#[test]
fn lenient_parsing_never_panics() {
    let _ = SearchParams::new("");
    assert_eq!(SearchParams::new("&&&").get("x"), None);
    assert_eq!(SearchParams::new("=novalue").get("x"), None);
}

#[test]
fn to_value_exposes_get_method_to_templates() {
    // Smoke-test the `minijinja::value::Object` wiring end-to-end via a
    // real template render (`bf-render`'s own path), rather than only unit
    // testing `SearchParams::get` directly.
    let dir = std::env::temp_dir().join(format!("bf-search-params-test-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("t.j2"), "{{ searchParams.get('sort') }}|{{ (searchParams.get('missing') if (searchParams.get('missing') is defined and searchParams.get('missing') is not none) else 'default') }}").unwrap();

    let env = barefootjs::backend_minijinja::build_environment(&dir);
    let session = barefootjs::RenderSession::new();
    let root = barefootjs::BfInstance::root(session, "test");
    let vars = barefootjs::num::JsValue::Object(Default::default());
    let extra = vec![("searchParams".to_string(), SearchParams::new("sort=price").to_value())];
    let out = barefootjs::backend_minijinja::render_entry(&env, "t", root.as_mj_value(), &vars, &extra).unwrap();
    assert_eq!(out, "price|default");

    std::fs::remove_dir_all(&dir).ok();
}
