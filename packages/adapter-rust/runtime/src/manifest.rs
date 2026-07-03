//! Production manifest-driven child-component registration -- Rust port of
//! `packages/adapter-jinja/python/barefootjs/runtime.py`'s
//! `register_components_from_manifest` / `_derive_stash_from_defaults`, the
//! path a production host (the `integrations/axum` example) uses to
//! register every compiled component from the `bf build` manifest
//! (`manifest.json`) in one call instead of hand-wiring
//! `register_child_renderer` per route the way `integrations/flask/app.py`
//! does.
//!
//! ## Divergence from the Python port
//!
//! Python's `register_components_from_manifest` (`runtime.py` lines
//! 621-706) only registers manifest entries shaped `ui/<name>/index`
//! (`_MANIFEST_ENTRY_RE`) -- a component-library registry convention for
//! the separate `/ui` design-system package. This port additionally
//! accepts FLAT entries (`"PostListItem"`, `"ToggleItem"`, ...), which is
//! what EVERY entry in a `bf build` manifest looks like for a plain
//! `components: [...]` config with no `ui/` subfolder (verified against a
//! real build of `integrations/flask`: `dist/templates/manifest.json` has
//! no `ui/`-prefixed keys at all -- see `packages/cli/src/lib/build.ts`'s
//! `effectiveNamesFor`). `integrations/axum`'s own manifest is entirely
//! flat (`components: ['../shared/components', '../shared/blog']`, same
//! layout as flask/gin), so a literal `ui/`-only port would register
//! nothing there -- this extension is what makes the function "the
//! production path to register every compiled component" the axum
//! integration needs. `ui/<name>/index` entries are still recognised
//! exactly like the Python port, so a `ui/` component-library registry
//! works unchanged if one is ever compiled into an integration's manifest.
//!
//! Unlike Python (which builds a bespoke renderer closure per manifest
//! entry, re-deriving scope-id chaining / rest-bag routing / ssrDefaults
//! merge inline in `make_renderer` every time), this port only needs to
//! REGISTER a [`ChildRendererSpec`] per entry: [`crate::runtime::BfInstance::
//! render_child`] already implements that whole contract generically for
//! every registered child (scope-id chaining, `_bf_slot`/`key` popping,
//! rest-bag routing, ssrDefaults-then-caller-props merge -- see its
//! docstring), because it was built to serve `bf-render`'s payload-driven
//! children the same way. Registering a manifest entry is therefore just:
//! derive the registry key + template name from `markedTemplate`, flatten
//! `ssrDefaults` to its static fallback values via
//! [`derive_stash_from_defaults`] (called with EMPTY props, since the
//! caller-props override Python's closure applies per-call is already
//! applied generically, once, inside `render_child`), and derive
//! `rest_props_name`/`param_names` from which `ssrDefaults` entries carry
//! `isRestProps`/`propName` (see `packages/jsx/src/ssr-defaults.ts`'s
//! `extractSsrDefaults`, which only ever sets `propName` to the entry's OWN
//! key -- so this static-then-override merge order is exactly equivalent
//! to Python's per-call `props.get(propName, value)` derivation).

use crate::num::JsValue;
use crate::runtime::{js_to_mj, ChildRendererSpec, RenderSession};
use std::collections::{BTreeMap, HashMap};
use std::sync::Arc;

/// Convert a PascalCase component name to the snake_case template/registry
/// name every compiled template's `bf.render_child('<snake>', ...)` call
/// site uses. Port of the TS emitter's naming transform (byte-identical
/// logic to `packages/adapter-rust/src/adapter/minijinja-adapter.ts`'s
/// `toTemplateName` and `packages/adapter-rust/src/test-render.ts`'s
/// `toSnakeCase`; verified against a real build's `render_child('toggle_
/// item', ...)` / `render_child('post_list_item', ...)` call sites) --
/// kept in lock-step with those two.
pub fn to_template_name(component_name: &str) -> String {
    let mut out = String::with_capacity(component_name.len() + 4);
    for (i, c) in component_name.chars().enumerate() {
        if c.is_ascii_uppercase() {
            if i > 0 {
                out.push('_');
            }
            out.push(c.to_ascii_lowercase());
        } else {
            out.push(c);
        }
    }
    out
}

/// Derive template-stash key/value pairs from a manifest entry's
/// `ssrDefaults` section (port of `runtime.py`'s
/// `_derive_stash_from_defaults`). Each entry is either a bare JSON value
/// (used as-is) or an object shaped `{value, propName?, isRestProps?}`:
///
///   * `isRestProps: true` -- prefer `props[<this entry's own key>]` (the
///     rest-props bag the caller may have already assembled), else the
///     static `value` fallback (normally `{}`).
///   * `propName` set -- prefer `props[propName]` when present AND not
///     `null`/`undefined`, else the static `value` fallback. Every
///     `propName` the TS extractor emits equals its own entry's key (see
///     `extractSsrDefaults`), so this always reads back the SAME key it
///     writes -- a caller with no relevant props (this module's own
///     registration path, below) can pass an empty `props` document to get
///     pure static fallbacks.
///   * neither set -- the static `value` (a signal/memo's default,
///     internal to the component, never sourced from `props`).
pub fn derive_stash_from_defaults(defaults: &JsValue, props: &JsValue) -> JsValue {
    let defaults_map = match defaults.as_object() {
        Some(m) => m,
        None => return JsValue::Object(BTreeMap::new()),
    };
    let props_map = props.as_object();
    let mut extra = BTreeMap::new();
    for (name, d) in defaults_map {
        let dm = match d.as_object() {
            Some(m) => m,
            None => {
                extra.insert(name.clone(), d.clone());
                continue;
            }
        };
        let fallback = || dm.get("value").cloned().unwrap_or(JsValue::Null);
        if matches!(dm.get("isRestProps"), Some(JsValue::Bool(true))) {
            let v = props_map.and_then(|p| p.get(name)).cloned().unwrap_or_else(fallback);
            extra.insert(name.clone(), v);
            continue;
        }
        let prop_name = dm.get("propName").and_then(|v| v.as_str());
        let from_props = prop_name.and_then(|pn| props_map.and_then(|p| p.get(pn)));
        let v = match from_props {
            Some(pv) if !matches!(pv, JsValue::Null) => pv.clone(),
            _ => fallback(),
        };
        extra.insert(name.clone(), v);
    }
    JsValue::Object(extra)
}

/// Strip the manifest's `markedTemplate` value (e.g. `"templates/PostList
/// Item.j2"`) down to the bare template base name (`"PostListItem"`) --
/// mirrors `runtime.py`'s `_STRIPPED_TEMPLATE_SUFFIXES` handling, extended
/// with `.j2` (this adapter's own extension; the Python list only needed
/// `.html.ep` / `.tx` / `.jinja` for its own sibling adapters).
fn strip_manifest_template_path(marked: &str) -> String {
    let stripped = marked.strip_prefix("templates/").unwrap_or(marked);
    for suffix in [".j2", ".jinja", ".html.ep", ".tx"] {
        if let Some(s) = stripped.strip_suffix(suffix) {
            return s.to_string();
        }
    }
    stripped.to_string()
}

/// `ui/<name>/index` -> `<name>` (Python's `_MANIFEST_ENTRY_RE`); any other
/// manifest key with no `/` is used verbatim as the PascalCase component
/// name (this crate's flat-manifest extension -- see the module
/// docstring). A key with a `/` that isn't `ui/<name>/index`-shaped is an
/// unrecognised nested path shape and is skipped rather than guessed at.
fn component_name_for_entry(entry_name: &str) -> Option<String> {
    if let Some(rest) = entry_name.strip_prefix("ui/") {
        return rest.strip_suffix("/index").map(str::to_string);
    }
    if entry_name.contains('/') {
        return None;
    }
    Some(entry_name.to_string())
}

/// Walk a `bf build` manifest (`manifest.json`, decoded to [`JsValue`] via
/// [`JsValue::from_json`]) and register one [`ChildRendererSpec`] per
/// component entry into `session`, so every compiled component (anything a
/// template reaches via `bf.render_child(...)`) is reachable in a single
/// call -- the production registration path `integrations/axum`'s route
/// handlers use (see the module docstring's divergence note for why this
/// needn't re-derive `render_child`'s per-call logic the way Python's
/// closures do).
///
/// `signal_init` is an opt-in STATIC override keyed by the REGISTRY key
/// (the same snake_case name `render_child` looks up, e.g.
/// `"post_list_item"`): entries here are merged OVER the manifest-derived
/// defaults at registration time. This is the Rust-appropriate shape of
/// Python's per-call `signal_init` callback (`props -> dict`): since
/// `render_child` already applies the CALLER's per-call props on top of
/// whatever is registered here (see its docstring), a static override map
/// covers every case a registered CHILD needs. A derivation that genuinely
/// depends on the current REQUEST (not the immediate caller's props --
/// e.g. the blog's `PostList` reading `?sort=`/`?tag=` from the URL query)
/// is a ROOT-level render, not a registered child, and is handled by
/// calling [`derive_stash_from_defaults`] directly with the real
/// request-derived props instead (see `integrations/axum/src/blog.rs`).
pub fn register_components_from_manifest(
    session: &Arc<RenderSession>,
    manifest: &JsValue,
    signal_init: &HashMap<String, JsValue>,
) {
    let entries = match manifest.as_object() {
        Some(m) => m,
        None => return,
    };
    for (entry_name, entry) in entries {
        if entry_name == "__barefoot__" {
            continue;
        }
        let component_name = match component_name_for_entry(entry_name) {
            Some(n) => n,
            None => continue,
        };
        let entry_obj = match entry.as_object() {
            Some(m) => m,
            None => continue,
        };
        let marked = entry_obj.get("markedTemplate").and_then(|v| v.as_str()).unwrap_or("");
        if marked.is_empty() {
            continue;
        }
        let template_name = strip_manifest_template_path(marked);
        let registry_key = to_template_name(&component_name);

        let empty_props = JsValue::Object(BTreeMap::new());
        let ssr_defaults = entry_obj.get("ssrDefaults").cloned().unwrap_or_else(|| JsValue::Object(BTreeMap::new()));
        let mut defaults = derive_stash_from_defaults(&ssr_defaults, &empty_props);
        if let Some(overrides) = signal_init.get(&registry_key) {
            if let (JsValue::Object(base), Some(over)) = (&mut defaults, overrides.as_object()) {
                for (k, v) in over {
                    base.insert(k.clone(), v.clone());
                }
            }
        }

        let (rest_props_name, param_names) = match ssr_defaults.as_object() {
            Some(m) => {
                let mut rest = None;
                let mut params = Vec::new();
                for (name, d) in m {
                    let Some(dm) = d.as_object() else { continue };
                    if matches!(dm.get("isRestProps"), Some(JsValue::Bool(true))) {
                        rest = Some(name.clone());
                    } else if dm.contains_key("propName") {
                        params.push(name.clone());
                    }
                }
                (rest, params)
            }
            None => (None, Vec::new()),
        };

        session.register_child_renderer(
            registry_key,
            ChildRendererSpec {
                component_name: template_name.clone(),
                template: template_name,
                ssr_defaults: js_to_mj(&defaults),
                rest_props_name,
                param_names,
            },
        );
    }
}

/// Read and decode a `bf build` manifest.json from disk into the working
/// [`JsValue`] domain -- the one bit of I/O plumbing every production host
/// needs before it can call [`register_components_from_manifest`], kept
/// here so `integrations/axum` doesn't hand-roll the same three lines
/// (`fs::read_to_string` + `serde_json::from_str` + `JsValue::from_json`).
pub fn load_manifest(path: &std::path::Path) -> std::io::Result<JsValue> {
    let text = std::fs::read_to_string(path)?;
    let parsed: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
    Ok(JsValue::from_json(&parsed))
}
