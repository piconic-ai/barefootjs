//! minijinja `Environment` construction, the custom formatter, canonical
//! JSON encoding, and named-template rendering.
//!
//! Port of `packages/adapter-jinja/python/barefootjs/backend_jinja.py`'s
//! four engine-specific operations the runtime delegates to
//! (`encode_json`, `mark_raw`, `materialize`, `render_named`) -- adjusted
//! for the design contract's minijinja Environment shape (see the design
//! doc's "minijinja Environment contract" section, verified against
//! minijinja 2.21.0):
//!
//!   * `ChainableUndefined` equivalent: [`UndefinedBehavior::Chainable`].
//!   * `trim_blocks` / `lstrip_blocks`: both `true` (Jinja2 parity).
//!   * `.j2` is NOT auto-escaped by minijinja's own extension-sniffing
//!     default, so [`Environment::set_auto_escape_callback`] forces
//!     `AutoEscape::Html` unconditionally.
//!   * A custom [`Environment::set_formatter`] absorbs JS/minijinja
//!     semantic differences UNIFORMLY (no per-fixture hacks): `undefined`/
//!     `none` print nothing, safe values pass through raw, strings escape
//!     with MarkupSafe-compatible entities (`&#39;` for `'`, NOT
//!     minijinja's default `&#x27;` -- fixtures pin `&#39;`), numbers
//!     format via [`crate::num::format_js_number`] (a fallback: templates
//!     normally route through `bf.string()` first), bools print
//!     `true`/`false`.
//!
//! `materialize` has no Rust analogue: JSX children are captured via
//! minijinja `{% set %}...{% endset %}` blocks, which always yield a
//! concrete rendered `Value::from_safe_string` (never a lazy callable, no
//! `bf-render` payload path constructs one either), so there is nothing to
//! resolve.

use crate::num::{self, JsValue};
use crate::runtime;
use minijinja::value::Value as MjValue;
use minijinja::{escape_formatter, path_loader, AutoEscape, Environment, Error, Output, State, UndefinedBehavior};
use std::collections::BTreeMap;
use std::path::Path;

/// Build the minijinja `Environment` per the design contract. `templates_dir`
/// contains `<snake_case>.j2` files loaded by base name (no `templates/`
/// prefix, no extension) via [`Environment::get_template`].
pub fn build_environment(templates_dir: &Path) -> Environment<'static> {
    let mut env = Environment::new();
    env.set_loader(path_loader(templates_dir));
    env.set_undefined_behavior(UndefinedBehavior::Chainable);
    env.set_trim_blocks(true);
    env.set_lstrip_blocks(true);
    env.set_auto_escape_callback(|_name| AutoEscape::Html);
    env.set_formatter(bf_formatter);
    env
}

/// MarkupSafe-compatible escape for plain (non-safe) string interpolation:
/// `&` `&amp;`, `<` `&lt;`, `>` `&gt;`, `"` `&quot;`, `'` `&#39;`. The ONLY
/// divergence from minijinja's own default HTML escaper
/// (`crate::utils::write_escaped` in the minijinja source) is the
/// apostrophe entity (minijinja default: `&#x27;`) -- everything else
/// matches minijinja's own table already, kept explicit here so the whole
/// policy lives in one place next to the formatter that uses it.
///
/// NOT the same escaper as `runtime::html_escape` (used by `spread_attrs` /
/// `hydration_attrs` / `data_key_attr`'s raw attribute-syntax construction),
/// which uses `&#34;` for `"` (matching Go's `template.HTMLEscapeString`
/// byte-for-byte so SSR output stays identical across adapters). Two
/// call sites, two historically-pinned entity choices; unifying them is
/// out of scope for this port.
fn markupsafe_escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#39;"),
            _ => out.push(c),
        }
    }
    out
}

fn bf_formatter(out: &mut Output, state: &State, value: &MjValue) -> Result<(), Error> {
    if value.is_undefined() || value.is_none() {
        return Ok(());
    }
    if value.is_safe() {
        out.write_str(value.as_str().unwrap_or_default()).map_err(Error::from)?;
        return Ok(());
    }
    match value.kind() {
        minijinja::value::ValueKind::Bool => {
            out.write_str(if value.is_true() { "true" } else { "false" }).map_err(Error::from)?;
        }
        minijinja::value::ValueKind::Number => {
            let n = f64::try_from(value.clone()).unwrap_or(f64::NAN);
            out.write_str(&num::format_js_number(n)).map_err(Error::from)?;
        }
        minijinja::value::ValueKind::String => {
            out.write_str(&markupsafe_escape(value.as_str().unwrap_or(""))).map_err(Error::from)?;
        }
        // Arrays/maps/objects are never interpolated directly by generated
        // templates (they always go through `bf.json` / `bf.string` /
        // `bf.spread_attrs` first) -- fall back to minijinja's own default
        // rendering for defensive completeness.
        _ => escape_formatter(out, state, value)?,
    }
    Ok(())
}

/// Canonical JSON encoding for `bf.json` / `bf-p` / `bf-scope`: sorted keys
/// (free, since [`JsValue::Object`] is a `BTreeMap`), compact separators
/// (`serde_json::to_string`'s default), non-finite floats -> JSON `null`
/// recursively (`JsValue::to_json`'s documented contract -- see `num.rs`).
pub fn encode_json(v: &JsValue) -> String {
    serde_json::to_string(&v.to_json()).expect("JsValue::to_json always produces a JSON-encodable document")
}

fn build_context(bf_value: MjValue, vars: &JsValue) -> BTreeMap<String, MjValue> {
    let mut ctx = BTreeMap::new();
    if let Some(map) = vars.as_object() {
        for (k, v) in map {
            ctx.insert(runtime::mangle_ident(k), runtime::js_to_mj(v));
        }
    }
    ctx.insert("bf".to_string(), bf_value);
    ctx
}

/// Render `<name>.j2` with `bf_value` bound as the `bf` variable, plus the
/// supplied template vars (keyword-mangled -- the one point every props
/// dict is turned into template variables). Used for the top-level entry
/// render (`bf-render`'s own `env`, no template is executing yet).
pub fn render_named(env: &Environment<'static>, template_name: &str, bf_value: MjValue, vars: &JsValue) -> Result<String, Error> {
    let template = env.get_template(&format!("{template_name}.j2"))?;
    template.render(build_context(bf_value, vars))
}

/// Same as [`render_named`] but sourced from a `State` -- the re-entrant
/// path `bf.render_child` uses to render a child template from WITHIN an
/// already-executing template, via `state.env()`.
pub fn render_named_from_state(state: &State, template_name: &str, bf_value: MjValue, vars: &JsValue) -> Result<String, Error> {
    let template = state.env().get_template(&format!("{template_name}.j2"))?;
    template.render(build_context(bf_value, vars))
}

/// Like [`render_named_from_state`], but `vars` are ALREADY
/// `minijinja::Value`s with ALREADY keyword-mangled keys (built by
/// `render_child`), rather than a `JsValue` document to mangle-and-convert
/// here. This is the child-render path: `render_child` must keep props as
/// `Value` end-to-end so a safe (JSX children) value survives -- routing
/// through `&JsValue`/[`build_context`] would strip the safe flag off any
/// safe-string entry (see `runtime::BfInstance::render_child`'s docstring).
pub fn render_named_from_state_values(
    state: &State,
    template_name: &str,
    bf_value: MjValue,
    mut vars: BTreeMap<String, MjValue>,
) -> Result<String, Error> {
    let template = state.env().get_template(&format!("{template_name}.j2"))?;
    vars.insert("bf".to_string(), bf_value);
    template.render(vars)
}

/// Like [`render_named`], plus extra raw `minijinja::Value` context entries
/// (keyword-mangled like every other var) inserted after the `vars`-derived
/// ones. Used by `bf-render`'s entry point to bind `searchParams` -- a
/// [`crate::search_params::SearchParams`] `Object`, which has no
/// [`JsValue`] representation (it isn't a JSON-shaped value), so it can't
/// flow through the normal `vars: &JsValue` path.
pub fn render_entry(env: &Environment<'static>, template_name: &str, bf_value: MjValue, vars: &JsValue, extra_vars: &[(String, MjValue)]) -> Result<String, Error> {
    let template = env.get_template(&format!("{template_name}.j2"))?;
    let mut ctx = build_context(bf_value, vars);
    for (k, v) in extra_vars {
        ctx.insert(runtime::mangle_ident(k), v.clone());
    }
    template.render(ctx)
}
