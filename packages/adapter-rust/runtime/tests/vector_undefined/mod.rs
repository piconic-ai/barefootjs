//! JS `undefined` in the golden vectors (`spec/js-undefined-value.md`, "JSON
//! encoding for vectors"): the one-key `{"$undef": true}` sentinel, shared by
//! the primitive, helper and eval vector harnesses.
//!
//! The Rust runtime has no undefined value yet (rollout step U3 adds
//! `JsValue::Undefined`), so for now:
//!
//! - in `args` and the evaluator `env` the sentinel decodes to [`arg`], the
//!   host nil (`JsValue::Null`) a template receives for `undefined` today;
//! - in an `expect` it matches only a value [`is_runtime_undefined`] accepts.
//!   None exists yet, so it never matches, also inside nested arrays and
//!   objects, and every such case is listed in an expected-failure ledger or
//!   pinned as a divergence.
//!
//! U3 flips both here: [`arg`] returns the runtime's undefined and
//! [`is_runtime_undefined`] recognizes it.
#![allow(dead_code)]

use barefootjs::num::JsValue;
use serde_json::Value as JsonValue;
use std::path::Path;

/// What a `$undef` in `args` / `env` decodes to.
pub fn arg() -> JsValue {
    JsValue::Null
}

/// Whether `got` is the runtime's own undefined value (none yet: U3).
pub fn is_runtime_undefined(_got: &JsValue) -> bool {
    false
}

/// Whether a JSON value is `{"$undef": true}`.
pub fn is_sentinel(v: &JsonValue) -> bool {
    v.as_object().is_some_and(|o| o.len() == 1 && o.get("$undef") == Some(&JsonValue::Bool(true)))
}

/// The sentinel decoded as a plain object, as `JsValue::from_json` gives it.
pub fn sentinel_value() -> JsValue {
    JsValue::Object([("$undef".to_string(), JsValue::Bool(true))].into_iter().collect())
}

/// Whether a decoded value is the sentinel object.
pub fn is_sentinel_value(v: &JsValue) -> bool {
    *v == sentinel_value()
}

/// Replaces every decoded sentinel in an `args` / `env` value with [`arg`].
pub fn to_arg(v: JsValue) -> JsValue {
    if is_sentinel_value(&v) {
        return arg();
    }
    match v {
        JsValue::Array(a) => JsValue::Array(a.into_iter().map(to_arg).collect()),
        JsValue::Object(o) => JsValue::Object(o.into_iter().map(|(k, x)| (k, to_arg(x))).collect()),
        other => other,
    }
}

/// The "rust" runtime of an expected-failure ledger: case key to entry.
pub fn load_expected_failures(path: &Path) -> serde_json::Map<String, JsonValue> {
    let raw = std::fs::read_to_string(path).unwrap_or_else(|e| panic!("read {path:?}: {e}"));
    let doc: JsonValue = serde_json::from_str(&raw).unwrap_or_else(|e| panic!("parse {path:?}: {e}"));
    doc["runtimes"]["rust"].as_object().cloned().expect("ledger has no \"rust\" runtime")
}
