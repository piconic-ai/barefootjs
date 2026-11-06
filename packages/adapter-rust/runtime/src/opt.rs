//! `Opt<T>`: a typed host prop with JS's four presence states
//! (spec/js-undefined-value.md, §3 "Rust" and §7 (2)).
//!
//! JS tells four states of a prop apart: absent (`<C/>`), present
//! `undefined` (`<C c={undefined}/>`, a forwarded `c={props.c}`), `null`,
//! and a value. A plain `Option<T>` field holds two of them, and serde reads
//! a JSON `null` and a missing key into the same `None`. `Opt<T>` keeps all
//! four, so a host that builds props from its own structs controls presence
//! the way a [`JsValue`] map does (a missing key is absent, a
//! [`JsValue::Null`] entry is `null`, a [`JsValue::Undefined`] entry is a
//! present `undefined`).
//!
//! The serde recipe for a struct field:
//!
//! ```
//! use barefootjs::Opt;
//! use serde::{Deserialize, Serialize};
//!
//! #[derive(Serialize, Deserialize, Default)]
//! struct ChipProps {
//!     label: String,
//!     // A missing key deserializes to `Opt::Absent` (`default`), JSON
//!     // `null` to `Opt::Null`; absent and undefined are skipped on output,
//!     // as `JSON.stringify` drops an `undefined` member.
//!     #[serde(default, skip_serializing_if = "Opt::is_omitted")]
//!     c: Opt<String>,
//! }
//!
//! let p: ChipProps = serde_json::from_str(r#"{"label":"x","c":null}"#).unwrap();
//! assert_eq!(p.c, Opt::Null);
//! let p: ChipProps = serde_json::from_str(r#"{"label":"x"}"#).unwrap();
//! assert_eq!(p.c, Opt::Absent);
//! assert_eq!(serde_json::to_string(&p).unwrap(), r#"{"label":"x"}"#);
//! ```
//!
//! [`Opt::to_js`] turns a field into the [`JsValue`] the props map holds
//! (`None` for an absent field: leave the key out), and
//! [`Opt::insert_into`] does that for one key of a props map. The
//! `#[serde(default)]` attribute matters: without it a missing key is a
//! deserialization error, and `Option<Option<T>>` with `default` alone
//! reads `null` as `None` too (the serde gotcha `serde_with`'s
//! `double_option` works around), which `Opt` needs no helper crate for.

use crate::num::JsValue;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use std::collections::BTreeMap;

/// A host prop's JS presence state. The default is [`Opt::Absent`].
#[derive(Debug, Clone, PartialEq, Default)]
pub enum Opt<T> {
    /// The caller did not pass the prop (JS `!('c' in props)`): it reads as
    /// `undefined`, and its destructure default applies.
    #[default]
    Absent,
    /// The caller passed the key holding `undefined` (JS `'c' in props`):
    /// it reads as `undefined`, its default applies, and a `{...props}`
    /// spread carries the key.
    Undefined,
    /// JS `null`: no default applies.
    Null,
    /// A value.
    Some(T),
}

impl<T> Opt<T> {
    /// JS `'c' in props`: any state but [`Opt::Absent`].
    pub fn passed(&self) -> bool {
        !matches!(self, Opt::Absent)
    }

    /// Whether the value reads as JS `undefined` ([`Opt::Absent`] or
    /// [`Opt::Undefined`]). The `skip_serializing_if` of a serde field, as
    /// `JSON.stringify` drops a member holding `undefined`.
    pub fn is_omitted(&self) -> bool {
        matches!(self, Opt::Absent | Opt::Undefined)
    }

    /// The value, when there is one.
    pub fn as_value(&self) -> Option<&T> {
        match self {
            Opt::Some(v) => Some(v),
            _ => None,
        }
    }

    /// What a parent passes for `c={expr}`: the key is present even when the
    /// value is `undefined`.
    pub fn forward(self) -> Opt<T> {
        match self {
            Opt::Absent => Opt::Undefined,
            other => other,
        }
    }
}

impl<T: Serialize> Opt<T> {
    /// The [`JsValue`] a props map holds for this prop: `None` when it is
    /// absent (leave the key out), else [`JsValue::Undefined`],
    /// [`JsValue::Null`] or the value, converted through `serde_json`.
    pub fn to_js(&self) -> Option<JsValue> {
        match self {
            Opt::Absent => None,
            Opt::Undefined => Some(JsValue::Undefined),
            Opt::Null => Some(JsValue::Null),
            Opt::Some(v) => Some(serde_json::to_value(v).map(|j| JsValue::from_json(&j)).unwrap_or(JsValue::Null)),
        }
    }

    /// Insert this prop into a props map under `key`, or leave the key out
    /// when it is absent.
    pub fn insert_into(&self, props: &mut BTreeMap<String, JsValue>, key: &str) {
        if let Some(v) = self.to_js() {
            props.insert(key.to_string(), v);
        }
    }
}

impl<T> From<Option<T>> for Opt<T> {
    /// `Some(v)` is a value, `None` JS `null` (host nil is JS `null`).
    fn from(o: Option<T>) -> Self {
        o.map_or(Opt::Null, Opt::Some)
    }
}

impl<T: Serialize> Serialize for Opt<T> {
    /// A value as itself; anything else as `null` (an array element holding
    /// `undefined` is `null` in `JSON.stringify` too). Skip absent and
    /// undefined members with `skip_serializing_if = "Opt::is_omitted"`.
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            Opt::Some(v) => v.serialize(serializer),
            _ => serializer.serialize_none(),
        }
    }
}

impl<'de, T: Deserialize<'de>> Deserialize<'de> for Opt<T> {
    /// JSON `null` is [`Opt::Null`] and a value [`Opt::Some`]. A missing key
    /// never reaches this: `#[serde(default)]` makes it [`Opt::Absent`].
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        Option::<T>::deserialize(deserializer).map(Opt::from)
    }
}
