//! `props_attr` -- the `bf-p` hydration-payload attribute. The encoded JSON
//! is embedded in a SINGLE-quoted attribute, so it must be
//! attribute-escaped: a raw `'` inside a string value (e.g. a blog
//! paragraph) terminates the attribute early and the client hydrates from
//! truncated JSON (empty island text; found via the shared blog-ssr e2e).
//! Same fix across the Perl, Python, Ruby, and Rust runtimes -- keep the
//! four tests in sync. Like `render_child.rs`, the method is driven through
//! a real template render (the `bf` object needs a live `&State`).

use barefootjs::num::JsValue;
use barefootjs::{backend_minijinja, BfInstance, RenderSession};
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::Arc;

struct TempDir(PathBuf);

impl TempDir {
    fn new() -> TempDir {
        let dir = std::env::temp_dir().join(format!(
            "bf-props-attr-test-{}-{}",
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

fn render_props_attr(props: Option<JsValue>) -> String {
    let dir = TempDir::new();
    std::fs::write(dir.0.join("host.j2"), "<div{{ bf.props_attr() | safe }}></div>").unwrap();
    let env = backend_minijinja::build_environment(&dir.0);
    let session = RenderSession::new();
    let mut root = BfInstance::root(Arc::clone(&session), "test");
    root.props = props;
    backend_minijinja::render_named(&env, "host", root.as_mj_value(), &JsValue::Object(BTreeMap::new())).unwrap()
}

fn obj(entries: &[(&str, &str)]) -> JsValue {
    JsValue::Object(entries.iter().map(|(k, v)| (k.to_string(), JsValue::String(v.to_string()))).collect())
}

#[test]
fn empty_props_emit_nothing() {
    assert_eq!(render_props_attr(None), "<div></div>");
    assert_eq!(render_props_attr(Some(JsValue::Object(BTreeMap::new()))), "<div></div>");
}

#[test]
fn json_is_attribute_escaped() {
    let html = render_props_attr(Some(obj(&[("note", "it's <b> & co")])));
    assert_eq!(html, "<div bf-p='{&#34;note&#34;:&#34;it&#39;s &lt;b&gt; &amp; co&#34;}'></div>");
}

#[test]
fn attribute_round_trips_through_entity_decoding() {
    let html = render_props_attr(Some(obj(&[("note", "it's <b> & co")])));
    let start = html.find("bf-p='").unwrap() + 6;
    let end = html[start..].find('\'').unwrap() + start;
    let decoded = html[start..end]
        .replace("&#34;", "\"")
        .replace("&#39;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&");
    let parsed: serde_json::Value = serde_json::from_str(&decoded).unwrap();
    assert_eq!(parsed, serde_json::json!({"note": "it's <b> & co"}));
}
