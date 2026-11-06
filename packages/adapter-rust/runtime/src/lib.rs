//! `barefootjs` -- Rust runtime for BarefootJS marked templates (the
//! minijinja adapter). Port of
//! `packages/adapter-jinja/python/barefootjs/` (itself a port of
//! `packages/adapter-perl/lib/BarefootJS.pm`), consulting
//! `packages/adapter-go-template/runtime/*.go` where Rust-shape questions
//! arose. See each module's docstring for its specific provenance and any
//! documented divergences.
//!
//! JS `undefined` and `null` are two values (spec/js-undefined-value.md):
//! host nil ([`JsValue::Null`], minijinja's `none`, `serde_json`'s `null`)
//! is JS `null`, and [`JsValue::Undefined`] (minijinja's undefined) is JS
//! `undefined`. To leave a prop unset, omit its key; pass
//! [`JsValue::Undefined`] for a prop that is present and `undefined`. A
//! typed host prop that needs the four JS presence states is an [`Opt`].

pub mod backend_minijinja;
pub mod date;
pub mod evaluator;
pub mod manifest;
pub mod num;
pub mod opt;
pub mod runtime;
pub mod search_params;

pub use manifest::{derive_stash_from_defaults, load_manifest, register_components_from_manifest, to_template_name};
pub use num::JsValue;
pub use opt::Opt;
pub use runtime::{BfInstance, ChildRendererSpec, RenderSession};
pub use search_params::SearchParams;
