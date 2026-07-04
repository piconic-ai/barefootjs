//! Rendering helpers built on the `barefootjs` runtime crate
//! (`packages/adapter-rust/runtime`) -- the Rust-shaped equivalent of
//! `integrations/flask/app.py`'s `render_component` / `stash_from_ssr_
//! defaults` / `layout`, adapted to this crate's manifest-driven child
//! registration (`barefootjs::register_components_from_manifest`), which
//! removes MOST of Flask's per-route manual `children={...}` wiring: any
//! component that is its OWN top-level file under `components: [...]`
//! (`TodoItem.tsx`, `PostListItem.tsx`, `ReaderToolbar.tsx`, ...) gets a
//! `manifest.json` entry and is registered generically, once per request.
//!
//! One category still needs manual registration, mirroring Flask exactly:
//! a component defined as a SIBLING inside another file rather than its
//! own top-level source file (`ToggleItem` inside `Toggle.tsx`,
//! `ReactiveChild`/`PropsStyleChild`/`DestructuredStyleChild` inside
//! `ReactiveProps.tsx`) still compiles to its own `.j2` template (`bf
//! build` emits one file per component regardless of source layout), but
//! does NOT get a `manifest.json` entry (`packages/cli/src/lib/build.ts`
//! only registers top-level entry files) -- verified against a real build
//! of this integration: `dist/templates/manifest.json` has no `ToggleItem`
//! key even though `dist/templates/ToggleItem.j2` exists.
//! `EXTRA_CHILDREN` below is the Rust-shaped equivalent of Flask's
//! per-route `children={"toggle_item": "ToggleItem"}` dict for exactly
//! this gap -- registered unconditionally (harmless if a given route never
//! calls `render_child` for one), since none of these need SSR defaults
//! beyond what their parent template's compiled `render_child(...)` call
//! already supplies inline.

use crate::AppState;
use barefootjs::backend_minijinja;
use barefootjs::{register_components_from_manifest, BfInstance, JsValue, RenderSession};
use minijinja::value::Value as MjValue;
use minijinja::Environment;
use std::collections::{BTreeMap, HashMap};
use std::sync::Arc;

// ---------------------------------------------------------------------------
// JsValue builder helpers -- terser call sites than `JsValue::Object(...)`
// everywhere a route handler builds a literal props/stash document.
// ---------------------------------------------------------------------------

pub fn jobj<const N: usize>(pairs: [(&str, JsValue); N]) -> JsValue {
    JsValue::Object(pairs.into_iter().map(|(k, v)| (k.to_string(), v)).collect())
}

pub fn jarr(items: Vec<JsValue>) -> JsValue {
    JsValue::Array(items)
}

pub fn js(s: impl Into<String>) -> JsValue {
    JsValue::String(s.into())
}

pub fn jn(n: f64) -> JsValue {
    JsValue::Number(n)
}

pub fn jb(b: bool) -> JsValue {
    JsValue::Bool(b)
}

pub fn jnull() -> JsValue {
    JsValue::Null
}

pub fn empty_obj() -> JsValue {
    JsValue::Object(BTreeMap::new())
}

/// Shallow-merge `extra`'s keys into `base` (`extra` wins) -- mirrors the
/// Python integrations' `{**a, **b}` merge used to layer route-specific
/// stash overrides on top of the manifest-derived defaults.
pub fn merge_into(base: &mut JsValue, extra: &JsValue) {
    if let (JsValue::Object(b), Some(e)) = (base, extra.as_object()) {
        for (k, v) in e {
            b.insert(k.clone(), v.clone());
        }
    }
}

fn ssr_defaults_for(manifest: &JsValue, component: &str) -> JsValue {
    manifest
        .as_object()
        .and_then(|m| m.get(component))
        .and_then(|e| e.as_object())
        .and_then(|e| e.get("ssrDefaults"))
        .cloned()
        .unwrap_or_else(empty_obj)
}

/// Run `f` with a minijinja `Environment` appropriate for the current mode:
/// a FRESH environment (re-reading every `.j2` file from disk) in dev, so a
/// `bun run build:watch` rebuild shows up on the next request without a
/// server restart (mirrors `integrations/flask`'s `cache_size=0` /
/// `integrations/gin`'s `currentTemplates()` re-parse), or the ONE
/// environment built at startup in production.
pub fn with_env<T>(state: &AppState, f: impl FnOnce(&Environment<'static>) -> T) -> T {
    if state.dev {
        let env = backend_minijinja::build_environment(&state.templates_dir);
        f(&env)
    } else {
        f(&state.env)
    }
}

/// Build a fresh per-request [`RenderSession`] with every compiled
/// component registered as a renderable child (see the module docstring).
/// `signal_init` is the same opt-in per-registry-key static override
/// [`register_components_from_manifest`] accepts, for the rare child whose
/// derivation the static ssrDefaults extractor can't see through (e.g. the
/// blog's `NowPlaying`-as-a-child-of-`PostArticle`, which needs a `Math`
/// stash entry no signal/prop analysis would ever produce).
/// Sibling-compiled components with no `manifest.json` entry -- see the
/// module docstring. `(registry key, template/component base name)`.
const EXTRA_CHILDREN: &[(&str, &str)] = &[
    ("toggle_item", "ToggleItem"),
    ("reactive_child", "ReactiveChild"),
    ("props_style_child", "PropsStyleChild"),
    ("destructured_style_child", "DestructuredStyleChild"),
];

pub fn new_session(state: &AppState, signal_init: &HashMap<String, JsValue>) -> Arc<RenderSession> {
    let session = RenderSession::new();
    register_components_from_manifest(&session, &state.manifest, signal_init);
    for (key, name) in EXTRA_CHILDREN {
        session.register_child_renderer(
            key.to_string(),
            barefootjs::ChildRendererSpec {
                component_name: name.to_string(),
                template: name.to_string(),
                ssr_defaults: MjValue::from(BTreeMap::<String, MjValue>::new()),
                rest_props_name: None,
                param_names: Vec::new(),
            },
        );
    }
    session
}

/// Render one component as the root of a page (or as one top-level island
/// on a composed page -- see [`render_island`]), returning the rendered
/// body HTML and the accumulated `<script>` tags for every component (root
/// + every child it rendered) reached during this render.
///
/// `props` becomes both the `bf-p` hydration payload (when non-empty) AND,
/// via [`barefootjs::derive_stash_from_defaults`], the source for any
/// `ssrDefaults` entry whose `propName` matches a key in `props` (see that
/// function's docstring -- this is how e.g. `toggleItems` or
/// `initialTodos` reach the template as a real list rather than the
/// manifest's static `null` fallback). `stash` is layered on top
/// afterwards and always wins -- for SSR-only derived values no
/// ssrDefaults entry could ever hold (e.g. `ConditionalReturn`'s
/// `variant`, which is a bare-props-arg prop the static extractor doesn't
/// track at all -- see `packages/jsx/src/ssr-defaults.ts`'s doc comment on
/// why).
pub fn render_component(
    state: &AppState,
    session: &Arc<RenderSession>,
    component: &str,
    props: JsValue,
    stash: JsValue,
) -> Result<(String, String), String> {
    let defaults = ssr_defaults_for(&state.manifest, component);
    let mut vars = barefootjs::derive_stash_from_defaults(&defaults, &props);
    merge_into(&mut vars, &stash);
    render_root(state, session, component, &props, &vars)
}

/// Shared tail of [`render_component`] / [`render_island`]: mint a root
/// scope id, attach `props` as the `bf-p` hydration payload (when
/// non-empty), and render `component` with the caller-assembled `vars`.
fn render_root(
    state: &AppState,
    session: &Arc<RenderSession>,
    component: &str,
    props: &JsValue,
    vars: &JsValue,
) -> Result<(String, String), String> {
    let scope_id = format!("{component}_{}", session.next_rand_hex6());
    let mut root = BfInstance::root(Arc::clone(session), scope_id);
    if let Some(m) = props.as_object() {
        if !m.is_empty() {
            root.props = Some(props.clone());
        }
    }

    let body = with_env(state, |env| backend_minijinja::render_named(env, component, root.as_mj_value(), vars))
        .map_err(|e| format!("{e:#}"))?;
    let scripts = root.scripts();
    Ok((body, scripts))
}

/// Like [`render_component`], but for the ONE shape that document can't
/// carry: a pre-rendered HTML fragment that must reach the template as a
/// SAFE value (bypassing the plain-string auto-escape every `vars: &JsValue`
/// entry gets -- `JsValue` has no safe/unsafe distinction, see `barefootjs::
/// runtime::BfInstance::render_child`'s docstring for why this matters).
/// The compiled `PageShell.j2` interpolates its `children` prop as `{{
/// bf.string(children) }}` (no `| safe`), which only stays raw when
/// `children` arrives as an ALREADY-safe minijinja `Value` (`bf.string`
/// passes a safe string through unchanged -- see `runtime.rs`'s
/// `call_method("string", ...)` special case) -- so `children` must be
/// injected via [`backend_minijinja::render_entry`]'s `extra_vars` (a raw
/// `MjValue`), not the ordinary JSON-shaped `vars` path.
pub fn render_component_with_raw_children(
    state: &AppState,
    session: &Arc<RenderSession>,
    component: &str,
    props: JsValue,
    stash: JsValue,
    children_html: &str,
) -> Result<(String, String), String> {
    let scope_id = format!("{component}_{}", session.next_rand_hex6());
    let mut root = BfInstance::root(Arc::clone(session), scope_id);
    if let Some(m) = props.as_object() {
        if !m.is_empty() {
            root.props = Some(props.clone());
        }
    }

    let defaults = ssr_defaults_for(&state.manifest, component);
    let mut vars = barefootjs::derive_stash_from_defaults(&defaults, &props);
    merge_into(&mut vars, &stash);

    let extra_vars = [("children".to_string(), MjValue::from_safe_string(children_html.to_string()))];
    let body = with_env(state, |env| {
        backend_minijinja::render_entry(env, component, root.as_mj_value(), &vars, &extra_vars)
    })
    .map_err(|e| format!("{e:#}"))?;
    let scripts = root.scripts();
    Ok((body, scripts))
}

/// Render one island subtree that shares an ALREADY-CREATED `session` (and
/// therefore its script collector + child registry) with sibling islands
/// on the same page -- the blog's shell composition (`ThemeToggle` +
/// `Sidebar` + `PageShell` wrapping route content, or a standalone
/// `NowPlaying` island next to the post list) mirrors `integrations/
/// flask/app.py`'s `blog_island`, minus the per-child renderer wiring
/// (handled once, generically, by [`new_session`] -- see the module
/// docstring).
pub fn render_island(
    state: &AppState,
    session: &Arc<RenderSession>,
    component: &str,
    props: JsValue,
    extra: JsValue,
) -> Result<String, String> {
    // flask's `blog_island` renders with `{**seed, **props, **extra}`: the
    // caller's client props are ALSO template vars, wholesale — not just
    // where an ssrDefaults entry's `propName` picks them up. PostArticle
    // depends on this (its `title`/`date`/`body`/… props have no static
    // defaults, so `derive_stash_from_defaults` alone drops them and the
    // article SSRs empty; hydration never fills static text back in).
    let defaults = ssr_defaults_for(&state.manifest, component);
    let mut vars = barefootjs::derive_stash_from_defaults(&defaults, &props);
    merge_into(&mut vars, &props);
    merge_into(&mut vars, &extra);
    let (body, _scripts) = render_root(state, session, component, &props, &vars)?;
    Ok(body)
}

/// Read back the FULL accumulated `<script>` tag list for `session` --
/// scripts are session-level state (shared by every island rendered
/// against it), so this can be called once after composing a whole page
/// out of several [`render_island`] calls (see `blog.rs`), regardless of
/// which particular `BfInstance` most recently touched the session.
pub fn scripts_html(session: &Arc<RenderSession>) -> String {
    BfInstance::root(Arc::clone(session), "_scripts_readback").scripts()
}
