//! `barefootjs` -- Rust runtime for BarefootJS marked templates (the
//! minijinja adapter). Port of
//! `packages/adapter-jinja/python/barefootjs/` (itself a port of
//! `packages/adapter-perl/lib/BarefootJS.pm`), consulting
//! `packages/adapter-go-template/runtime/*.go` where Rust-shape questions
//! arose. See each module's docstring for its specific provenance and any
//! documented divergences.

pub mod backend_minijinja;
pub mod date;
pub mod evaluator;
pub mod manifest;
pub mod num;
pub mod runtime;
pub mod search_params;

pub use manifest::{derive_stash_from_defaults, load_manifest, register_components_from_manifest, to_template_name};
pub use num::JsValue;
pub use runtime::{BfInstance, ChildRendererSpec, RenderSession};
pub use search_params::SearchParams;
