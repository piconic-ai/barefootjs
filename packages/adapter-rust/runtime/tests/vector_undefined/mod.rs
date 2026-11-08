//! JS `undefined` in the golden vectors (`spec/js-undefined-value.md`, "JSON
//! encoding for vectors"): the one-key `{"$undef": true}` sentinel, shared by
//! the primitive, helper and eval vector harnesses.
//!
//! - In `args` and the evaluator `env` the sentinel decodes to [`arg`], the
//!   runtime's `JsValue::Undefined` (rollout step U3), which a template
//!   receives for `undefined`.
//! - In an `expect` it matches only a value [`is_runtime_undefined`]
//!   accepts: `JsValue::Undefined`, also inside nested arrays and objects.
#![allow(dead_code)]

use barefootjs::num::JsValue;
use serde_json::Value as JsonValue;

/// What a `$undef` in `args` / `env` decodes to.
pub fn arg() -> JsValue {
    JsValue::Undefined
}

/// Whether `got` is the runtime's own undefined value.
pub fn is_runtime_undefined(got: &JsValue) -> bool {
    got.is_undefined()
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
