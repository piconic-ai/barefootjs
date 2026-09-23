//! Conformance renderer binary: `bf-render <path-to-payload.json>`.
//!
//! Implements the bf-render payload protocol (design doc, "bf-render
//! payload protocol" section) verbatim. HTML -> stdout on success; on
//! error, a message -> stderr and exit 1.
//!
//! Non-finite numbers (JSON cannot spell NaN/Infinity) travel as
//! `{"__bf_special": "nan" | "inf" | "-inf"}` sentinel objects, decoded
//! recursively AFTER `serde_json` parses the document (the TS side
//! transforms values recursively BEFORE `JSON.stringify`; this binary is
//! the mirror-image decode step).

use barefootjs::backend_minijinja;
use barefootjs::num::JsValue;
use barefootjs::runtime::{BfInstance, ChildRendererSpec, RenderSession};
use barefootjs::search_params::SearchParams;
use minijinja::value::Value as MjValue;
use serde::Deserialize;
use serde_json::Value as JsonValue;
use std::path::PathBuf;
use std::process::ExitCode;
use std::sync::Arc;

#[derive(Deserialize)]
struct ChildPayload {
    name: String,
    template: String,
    #[serde(default)]
    ssr_defaults: JsonValue,
    #[serde(default)]
    rest_props_name: Option<String>,
    #[serde(default)]
    param_names: Vec<String>,
}

#[derive(Deserialize)]
struct Payload {
    templates_dir: String,
    entry: String,
    scope_id: String,
    #[serde(default)]
    vars: JsonValue,
    #[serde(default)]
    search_params: Option<String>,
    /// The caller's RAW props -- the root's `bf-p` hydration payload
    /// (`BfInstance::props`), NOT template vars (those are `vars` above).
    #[serde(default)]
    props: JsonValue,
    #[serde(default)]
    children: Vec<ChildPayload>,
}

/// Recursively decode a parsed JSON document into the working [`JsValue`]
/// domain, resolving `{"__bf_special": "nan" | "inf" | "-inf"}` sentinel
/// objects into real non-finite `f64`s along the way -- these are the ONE
/// shape `serde_json::Value` cannot carry natively (see `num.rs`'s module
/// docstring), so decoding happens here rather than via
/// `JsValue::from_json` (which has no sentinel to look for -- ordinary
/// JSON documents never need one).
fn decode_value(v: &JsonValue) -> JsValue {
    if let JsonValue::Object(map) = v {
        if map.len() == 1 {
            if let Some(JsonValue::String(kind)) = map.get("__bf_special") {
                let n = match kind.as_str() {
                    "nan" => f64::NAN,
                    "inf" => f64::INFINITY,
                    "-inf" => f64::NEG_INFINITY,
                    _ => f64::NAN,
                };
                return JsValue::Number(n);
            }
        }
        return JsValue::Object(map.iter().map(|(k, v)| (k.clone(), decode_value(v))).collect());
    }
    match v {
        JsonValue::Null => JsValue::Null,
        JsonValue::Bool(b) => JsValue::Bool(*b),
        JsonValue::Number(n) => JsValue::Number(n.as_f64().unwrap_or(f64::NAN)),
        JsonValue::String(s) => JsValue::String(s.clone()),
        JsonValue::Array(a) => JsValue::Array(a.iter().map(decode_value).collect()),
        JsonValue::Object(_) => unreachable!("handled above"),
    }
}

fn run(payload_path: &str) -> Result<String, String> {
    let text = std::fs::read_to_string(payload_path).map_err(|e| format!("failed to read {payload_path}: {e}"))?;
    let payload: Payload = serde_json::from_str(&text).map_err(|e| format!("invalid payload JSON: {e}"))?;

    let templates_dir = PathBuf::from(&payload.templates_dir);
    let env = backend_minijinja::build_environment(&templates_dir);

    let session = RenderSession::new();
    for child in &payload.children {
        session.register_child_renderer(
            // Keyed by the snake_case template base name -- matches the
            // literal `bf.render_child('<snake_name>', ...)` call sites the
            // TS emitter generates (`toTemplateName(comp.name)`), mirroring
            // `buildChildRenderers`'s `bf.register_child_renderer(snakeName, ...)`.
            child.template.clone(),
            ChildRendererSpec {
                component_name: child.name.clone(),
                template: child.template.clone(),
                // Kept RAW (`JsValue`, the FULL `{value, propName?,
                // isRestProps?}` shape) -- `render_child` resolves this
                // PER-CALL against the real caller props via
                // `derive_stash_from_defaults` (see `ChildRendererSpec::
                // ssr_defaults`'s docstring; #2524).
                ssr_defaults: decode_value(&child.ssr_defaults),
                rest_props_name: child.rest_props_name.clone(),
                param_names: child.param_names.clone(),
            },
        );
    }

    let mut root = BfInstance::root(Arc::clone(&session), payload.scope_id.clone());
    // Mirrors `integrations/axum`'s `render_root`: seed the root's `bf-p`
    // payload with the caller's props whenever they're non-empty.
    let props = decode_value(&payload.props);
    if props.as_object().is_some_and(|m| !m.is_empty()) {
        root.props = Some(props);
    }
    let vars = decode_value(&payload.vars);

    let mut extra: Vec<(String, MjValue)> = Vec::new();
    if let Some(query) = &payload.search_params {
        extra.push(("searchParams".to_string(), SearchParams::new(query).to_value()));
    }

    let html = backend_minijinja::render_entry(&env, &payload.entry, root.as_mj_value(), &vars, &extra).map_err(|e| {
        let mut msg = format!("{e:#}");
        let mut source = std::error::Error::source(&e);
        while let Some(s) = source {
            msg.push_str(&format!("\ncaused by: {s}"));
            source = s.source();
        }
        msg
    })?;
    // Mirrors where a real host's own layout places the SSR-portal outlet
    // (see `integrations/axum`'s `layout()`, `scripts`/`portals` params) —
    // after the component's own output (#3119). Collected but never
    // emitted otherwise, since this single-component CLI renders no
    // layout at all.
    Ok(html + &root.portals())
}

fn main() -> ExitCode {
    let payload_path = match std::env::args().nth(1) {
        Some(p) => p,
        None => {
            eprintln!("usage: bf-render <path-to-payload.json>");
            return ExitCode::FAILURE;
        }
    };
    match run(&payload_path) {
        Ok(html) => {
            print!("{html}");
            ExitCode::SUCCESS
        }
        Err(msg) => {
            eprintln!("{msg}");
            ExitCode::FAILURE
        }
    }
}
