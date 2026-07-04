//! `render_child` renderer-invocation contract, ported from
//! `packages/adapter-jinja/python/tests/test_render_child.py` (itself a
//! port of `packages/adapter-perl/t/render_child.t`).
//!
//! Renderer contract (#1897): a child's scope/slot identity chains off the
//! CALLER's `bf` instance (`self` inside `Object::call_method`), not off
//! whichever instance originally registered the renderer. Unlike the
//! Python port (which can stub a bare `BarefootJS` instance and call
//! `render_child` directly with a hand-built backend), this crate's
//! `render_child` takes a live `&minijinja::State` -- there is no public
//! way to construct one outside an active render -- so these tests drive
//! the SAME contract through real `.j2` template renders (mirroring what
//! `bf-render` does), which is the natural Rust-shaped equivalent and
//! additionally exercises the actual `Object::call_method` dispatch path.

use barefootjs::num::JsValue;
use barefootjs::runtime::{js_to_mj, ChildRendererSpec};
use barefootjs::{backend_minijinja, BfInstance, RenderSession};
use minijinja::value::Value as MjValue;
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::Arc;

struct TempDir(PathBuf);

impl TempDir {
    fn new(tag: &str) -> TempDir {
        let dir = std::env::temp_dir().join(format!("bf-render-child-test-{tag}-{}-{}", std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
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

/// `vars` for [`backend_minijinja::render_entry`] (top-level render), which
/// still takes JSON-shaped `&JsValue`.
fn no_defaults() -> JsValue {
    JsValue::Object(BTreeMap::new())
}

/// `ChildRendererSpec::ssr_defaults`, which is `minijinja::Value` (props
/// stay `Value` end-to-end through `render_child` -- see its docstring).
fn no_ssr_defaults() -> MjValue {
    MjValue::from(BTreeMap::<String, MjValue>::new())
}

#[test]
fn nested_render_child_chains_scope_off_the_caller_not_the_registrant() {
    let dir = TempDir::new("nested");
    dir.write("root.j2", "{{ bf.render_child('mid', {'_bf_slot': 's0'}) | safe }}");
    dir.write("mid.j2", "[{{ bf.scope_attr() }}:{{ bf.render_child('leaf', {'_bf_slot': 'inner'}) | safe }}]");
    dir.write("leaf.j2", "leaf@{{ bf.scope_attr() }}");

    let env = backend_minijinja::build_environment(&dir.0);
    let session = RenderSession::new();
    session.register_child_renderer(
        "mid".to_string(),
        ChildRendererSpec { component_name: "Mid".to_string(), template: "mid".to_string(), ssr_defaults: no_ssr_defaults(), rest_props_name: None, param_names: vec![] },
    );
    session.register_child_renderer(
        "leaf".to_string(),
        ChildRendererSpec { component_name: "Leaf".to_string(), template: "leaf".to_string(), ssr_defaults: no_ssr_defaults(), rest_props_name: None, param_names: vec![] },
    );

    let root = BfInstance::root(Arc::clone(&session), "Root_test");
    let out = backend_minijinja::render_entry(&env, "root", root.as_mj_value(), &no_defaults(), &[]).unwrap();

    // `mid`'s scope is `<root scope>_s0`; `leaf` is rendered from INSIDE
    // `mid`'s template (where `bf` is the `mid` instance), so its scope
    // chains off `mid`'s scope (`Root_test_s0_inner`), NOT off the root's
    // scope directly (`Root_test_inner`) -- proving the caller-chaining
    // contract.
    assert_eq!(out, "[Root_test_s0:leaf@Root_test_s0_inner]");
}

#[test]
fn missing_renderer_propagates_as_render_error() {
    let dir = TempDir::new("missing");
    dir.write("root.j2", "{{ bf.render_child('missing') }}");

    let env = backend_minijinja::build_environment(&dir.0);
    let session = RenderSession::new();
    let root = BfInstance::root(session, "Root_test");
    let err = backend_minijinja::render_entry(&env, "root", root.as_mj_value(), &no_defaults(), &[]).unwrap_err();
    assert!(err.to_string().contains("No renderer registered for child component 'missing'"), "unexpected error: {err}");
}

#[test]
fn reserved_word_prop_is_mangled() {
    let dir = TempDir::new("reserved");
    dir.write("root.j2", "{{ bf.render_child('kw', {'class': 'x', 'id': 'y'}) }}");
    dir.write("kw.j2", "{{ class_ }}-{{ id }}");

    let env = backend_minijinja::build_environment(&dir.0);
    let session = RenderSession::new();
    session.register_child_renderer(
        "kw".to_string(),
        ChildRendererSpec { component_name: "Kw".to_string(), template: "kw".to_string(), ssr_defaults: no_ssr_defaults(), rest_props_name: None, param_names: vec![] },
    );
    let root = BfInstance::root(session, "Root_test");
    let out = backend_minijinja::render_entry(&env, "root", root.as_mj_value(), &no_defaults(), &[]).unwrap();
    assert_eq!(out, "x-y");
}

#[test]
fn rest_bag_routing_and_ssr_defaults_merge() {
    let dir = TempDir::new("restbag");
    // `Card` declares `title` as a named param and destructures the rest
    // into `rest`; `subtitle` isn't a declared param, so it must land in
    // `rest`, not as a top-level stash var.
    dir.write("root.j2", "{{ bf.render_child('card', {'title': 'Hi', 'subtitle': 'Sub', 'extra': 'E'}) }}");
    dir.write("card.j2", "{{ title }}|{{ rest.subtitle }}|{{ rest.extra }}|{{ theme }}");

    let env = backend_minijinja::build_environment(&dir.0);
    let session = RenderSession::new();
    let mut defaults = BTreeMap::new();
    defaults.insert("theme".to_string(), JsValue::from("dark"));
    session.register_child_renderer(
        "card".to_string(),
        ChildRendererSpec {
            component_name: "Card".to_string(),
            template: "card".to_string(),
            ssr_defaults: js_to_mj(&JsValue::Object(defaults)),
            rest_props_name: Some("rest".to_string()),
            param_names: vec!["title".to_string()],
        },
    );
    let root = BfInstance::root(session, "Root_test");
    let out = backend_minijinja::render_entry(&env, "root", root.as_mj_value(), &no_defaults(), &[]).unwrap();
    assert_eq!(out, "Hi|Sub|E|dark");
}

#[test]
fn loop_child_without_slot_gets_a_fresh_component_prefixed_scope() {
    let dir = TempDir::new("loopchild");
    dir.write("root.j2", "{{ bf.render_child('item', {}) }}|{{ bf.render_child('item', {}) }}");
    dir.write("item.j2", "{{ bf.scope_attr() }}");

    let env = backend_minijinja::build_environment(&dir.0);
    let session = RenderSession::new();
    session.register_child_renderer(
        "item".to_string(),
        ChildRendererSpec { component_name: "Item".to_string(), template: "item".to_string(), ssr_defaults: no_ssr_defaults(), rest_props_name: None, param_names: vec![] },
    );
    let root = BfInstance::root(session, "Root_test");
    let out = backend_minijinja::render_entry(&env, "root", root.as_mj_value(), &no_defaults(), &[]).unwrap();
    let parts: Vec<&str> = out.split('|').collect();
    assert_eq!(parts.len(), 2);
    for p in &parts {
        assert!(p.starts_with("Item_"), "expected an Item_<rand> scope id, got {p:?}");
    }
    assert_ne!(parts[0], parts[1], "two loop-child renders must get distinct scope ids");
}

#[test]
fn childless_invocation_renders_with_no_props() {
    let dir = TempDir::new("childless");
    dir.write("root.j2", "{{ bf.render_child('leaf') }}");
    dir.write("leaf.j2", "leaf-ok");

    let env = backend_minijinja::build_environment(&dir.0);
    let session = RenderSession::new();
    session.register_child_renderer(
        "leaf".to_string(),
        ChildRendererSpec { component_name: "Leaf".to_string(), template: "leaf".to_string(), ssr_defaults: no_ssr_defaults(), rest_props_name: None, param_names: vec![] },
    );
    let root = BfInstance::root(session, "Root_test");
    let out = backend_minijinja::render_entry(&env, "root", root.as_mj_value(), &no_defaults(), &[]).unwrap();
    assert_eq!(out, "leaf-ok");
}

#[test]
fn children_safe_value_survives_render_child_and_bf_string_unescaped() {
    // Regression for the "children lost their safe flag" bug: a JSX
    // children capture (`{% set cap %}...{% endset %}`, mirroring what the
    // TS emitter generates for children forwarding) is a SAFE `Value`.
    // Passed as a child prop through `bf.string(...)` (as the emitter does
    // at every text/attribute-position value) and through
    // `bf.render_child`'s prop plumbing, it must reach the child template
    // STILL safe -- i.e. NOT HTML-escaped -- proving both fixes: (1)
    // `render_child` keeps props as `Value` end-to-end instead of
    // round-tripping through `JsValue` (which has no safe/unsafe
    // distinction), and (2) `bf.string` passes an already-safe string
    // input through unchanged (mirrors the Python runtime's `js_string`,
    // where a `str` input -- including a `Markup` -- is returned as-is).
    let dir = TempDir::new("safechildren");
    dir.write(
        "root.j2",
        "{% set cap %}<span>hi</span>{% endset %}{{ bf.render_child('wrap', {'inner': bf.string(cap)}) | safe }}",
    );
    dir.write("wrap.j2", "[{{ inner }}]");

    let env = backend_minijinja::build_environment(&dir.0);
    let session = RenderSession::new();
    session.register_child_renderer(
        "wrap".to_string(),
        ChildRendererSpec { component_name: "Wrap".to_string(), template: "wrap".to_string(), ssr_defaults: no_ssr_defaults(), rest_props_name: None, param_names: vec![] },
    );
    let root = BfInstance::root(session, "Root_test");
    let out = backend_minijinja::render_entry(&env, "root", root.as_mj_value(), &no_defaults(), &[]).unwrap();
    assert_eq!(out, "[<span>hi</span>]");
}
