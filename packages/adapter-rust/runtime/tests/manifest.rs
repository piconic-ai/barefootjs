//! Tests for `manifest::register_components_from_manifest` /
//! `derive_stash_from_defaults` -- the production manifest-registration
//! path `integrations/axum` uses (port of `packages/adapter-jinja/python/
//! tests`' coverage for `runtime.py`'s `register_components_from_manifest`
//! / `_derive_stash_from_defaults`, adjusted for this crate's
//! registration-only shape -- see `src/manifest.rs`'s module docstring).

use barefootjs::manifest::{derive_stash_from_defaults, register_components_from_manifest, to_template_name};
use barefootjs::num::JsValue;
use barefootjs::{backend_minijinja, BfInstance, RenderSession};
use std::collections::{BTreeMap, HashMap};
use std::path::PathBuf;
use std::sync::Arc;

struct TempDir(PathBuf);

impl TempDir {
    fn new(tag: &str) -> TempDir {
        let dir = std::env::temp_dir().join(format!(
            "bf-manifest-test-{tag}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        TempDir(dir)
    }
    fn write(&self, name: &str, content: &str) {
        std::fs::write(self.0.join(name), content).unwrap();
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        std::fs::remove_dir_all(&self.0).ok();
    }
}

fn obj(pairs: Vec<(&str, JsValue)>) -> JsValue {
    JsValue::Object(pairs.into_iter().map(|(k, v)| (k.to_string(), v)).collect())
}

#[test]
fn to_template_name_matches_ts_to_snake_case() {
    assert_eq!(to_template_name("ToggleItem"), "toggle_item");
    assert_eq!(to_template_name("PostListItem"), "post_list_item");
    assert_eq!(to_template_name("AIChatInteractive"), "a_i_chat_interactive");
    assert_eq!(to_template_name("Counter"), "counter");
}

#[test]
fn derive_stash_prefers_prop_over_static_value() {
    let defaults = obj(vec![
        ("count", obj(vec![("value", JsValue::Number(0.0))])),
        ("initial", obj(vec![("propName", JsValue::String("initial".into())), ("value", JsValue::Null)])),
    ]);
    // No matching prop: static fallback for both.
    let empty = JsValue::Object(BTreeMap::new());
    let out = derive_stash_from_defaults(&defaults, &empty);
    assert_eq!(out.as_object().unwrap().get("count"), Some(&JsValue::Number(0.0)));
    assert_eq!(out.as_object().unwrap().get("initial"), Some(&JsValue::Null));

    // Caller passed `initial`: propName-linked entry picks it up; unrelated
    // `count` entry (no propName) stays on its static default.
    let props = obj(vec![("initial", JsValue::Number(5.0))]);
    let out = derive_stash_from_defaults(&defaults, &props);
    assert_eq!(out.as_object().unwrap().get("initial"), Some(&JsValue::Number(5.0)));
    assert_eq!(out.as_object().unwrap().get("count"), Some(&JsValue::Number(0.0)));
}

#[test]
fn derive_stash_rest_props_prefers_props_own_key() {
    let defaults = obj(vec![("rest", obj(vec![("isRestProps", JsValue::Bool(true)), ("value", obj(vec![]))]))]);
    let props = obj(vec![("rest", obj(vec![("class", JsValue::String("x".into()))]))]);
    let out = derive_stash_from_defaults(&defaults, &props);
    let rest = out.as_object().unwrap().get("rest").unwrap().as_object().unwrap();
    assert_eq!(rest.get("class"), Some(&JsValue::String("x".into())));
}

#[test]
fn derive_stash_bare_value_entry_passes_through() {
    // A non-object entry (bare JSON value) is used as-is -- mirrors
    // Python's `if not isinstance(d, dict): extra[name] = d`.
    let defaults = obj(vec![("flag", JsValue::Bool(true))]);
    let out = derive_stash_from_defaults(&defaults, &JsValue::Object(BTreeMap::new()));
    assert_eq!(out.as_object().unwrap().get("flag"), Some(&JsValue::Bool(true)));
}

/// End-to-end: register a flat manifest (the shape every `integrations/*`
/// example actually produces) and confirm a real template's
/// `bf.render_child('post_list_item', ...)` resolves through it, with the
/// child's own ssrDefaults seeding an unset field.
#[test]
fn register_from_flat_manifest_wires_render_child() {
    let dir = TempDir::new("flat");
    dir.write(
        "post_list.j2",
        "{{ bf.render_child('post_list_item', {'title': 'Hello'}) | safe }}",
    );
    dir.write("PostListItem.j2", "{{ title }}/{{ bf.string(pinned) }}");

    let manifest = obj(vec![
        ("__barefoot__", obj(vec![("markedTemplate", JsValue::String(String::new()))])),
        (
            "PostListItem",
            obj(vec![
                ("markedTemplate", JsValue::String("templates/PostListItem.j2".into())),
                ("ssrDefaults", obj(vec![("pinned", obj(vec![("value", JsValue::Bool(false))]))])),
            ]),
        ),
    ]);

    let session = RenderSession::new();
    register_components_from_manifest(&session, &manifest, &HashMap::new());

    let env = backend_minijinja::build_environment(&dir.0);
    let root = BfInstance::root(Arc::clone(&session), "test".to_string());
    let html = backend_minijinja::render_named(&env, "post_list", root.as_mj_value(), &JsValue::Object(BTreeMap::new())).unwrap();
    assert_eq!(html.trim(), "Hello/false");
}

/// A `signal_init` override for a registry key wins over the manifest's
/// own static ssrDefaults value.
#[test]
fn register_from_flat_manifest_applies_signal_init_override() {
    let dir = TempDir::new("override");
    dir.write("root.j2", "{{ bf.render_child('widget', {}) | safe }}");
    dir.write("Widget.j2", "{{ bf.string(level) }}");

    let manifest = obj(vec![(
        "Widget",
        obj(vec![
            ("markedTemplate", JsValue::String("templates/Widget.j2".into())),
            ("ssrDefaults", obj(vec![("level", obj(vec![("value", JsValue::Number(1.0))]))])),
        ]),
    )]);

    let mut signal_init = HashMap::new();
    signal_init.insert("widget".to_string(), obj(vec![("level", JsValue::Number(9.0))]));

    let session = RenderSession::new();
    register_components_from_manifest(&session, &manifest, &signal_init);

    let env = backend_minijinja::build_environment(&dir.0);
    let root = BfInstance::root(Arc::clone(&session), "test".to_string());
    let html = backend_minijinja::render_named(&env, "root", root.as_mj_value(), &JsValue::Object(BTreeMap::new())).unwrap();
    assert_eq!(html.trim(), "9");
}

/// `ui/<name>/index`-shaped entries (the component-library registry
/// convention Python's port targets) still register correctly.
#[test]
fn register_from_ui_prefixed_manifest_entry() {
    let dir = TempDir::new("ui");
    dir.write("root.j2", "{{ bf.render_child('button', {}) | safe }}");
    dir.write("Button.j2", "btn");

    let manifest = obj(vec![(
        "ui/button/index",
        obj(vec![("markedTemplate", JsValue::String("templates/Button.j2".into()))]),
    )]);

    let session = RenderSession::new();
    register_components_from_manifest(&session, &manifest, &HashMap::new());

    let env = backend_minijinja::build_environment(&dir.0);
    let root = BfInstance::root(Arc::clone(&session), "test".to_string());
    let html = backend_minijinja::render_named(&env, "root", root.as_mj_value(), &JsValue::Object(BTreeMap::new())).unwrap();
    assert_eq!(html.trim(), "btn");
}
