# barefootjs

Rust runtime for [BarefootJS](https://barefootjs.dev/) marked templates, targeting [minijinja](https://crates.io/crates/minijinja).

[BarefootJS](https://github.com/piconic-ai/barefootjs) is a fine-grained reactive TSX compiler: you write components in TSX, and the compiler emits templates for your backend's template engine plus the client-side JS that hydrates them. This crate is the server half for Rust — it renders the templates produced by the `@barefootjs/rust` adapter.

## Installation

```sh
cargo add barefootjs
```

## Usage

Build a minijinja environment over the compiled template directory with `backend_minijinja::build_environment`, create a root `BfInstance` for the render (`BfInstance::root`), then render a named component template with `backend_minijinja::render_named`. `load_manifest` / `register_components_from_manifest` wire up the component manifest emitted by the compiler, and a `bf-render` binary is included for rendering from the command line.

### `undefined` and `null`

JS `undefined` and `null` are two values. Host nil — `JsValue::Null`, minijinja's `none`, a `serde_json` `null` — is JS `null`; `JsValue::Undefined` (minijinja's own undefined) is JS `undefined`. To leave a prop unset, omit its key: an omitted prop takes its destructure default, or reads as `undefined`. Pass `JsValue::Undefined` for a prop that is present and `undefined`. A prop passed as `JsValue::Null` is `null`: its default does not apply, and `'btn ' + c` renders `btn null`.

A host that builds props from its own structs keeps the four JS presence states (absent, present `undefined`, `null`, a value) with `barefootjs::Opt<T>`, whose default is `Opt::Absent`:

```rust
use barefootjs::{JsValue, Opt};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Default)]
struct ChipProps {
    label: String,
    // `{}` -> Opt::Absent, `{"c":null}` -> Opt::Null, `{"c":"x"}` -> Opt::Some.
    // Absent and undefined are skipped on output, as JSON.stringify drops an
    // `undefined` member.
    #[serde(default, skip_serializing_if = "Opt::is_omitted")]
    c: Opt<String>,
}

let p: ChipProps = serde_json::from_str(body)?;
let mut props = std::collections::BTreeMap::new();
props.insert("label".to_string(), JsValue::from(p.label));
p.c.insert_into(&mut props, "c"); // absent: no key
```

A plain `Option<T>` reads both `{}` and `{"c":null}` as `None`, and so does `#[serde(default)] Option<Option<T>>`; `Opt<T>` needs no helper crate (it is the same idea as `serde_with::rust::double_option`, plus the present-`undefined` state).

Key modules:

| Module | Role |
|--------|------|
| `runtime` | the engine-agnostic `bf` object (`BfInstance`, `RenderSession`) |
| `backend_minijinja` | the minijinja engine backend |
| `evaluator` | ParsedExpr evaluator for the `*_eval` helpers |
| `manifest` | component manifest loading and registration |
| `search_params` | `searchParams()` SSR reader |
| `opt` | `Opt<T>`, a typed host prop with JS's four presence states |

## Documentation

- [barefootjs.dev](https://barefootjs.dev/) — core documentation
- [GitHub: piconic-ai/barefootjs](https://github.com/piconic-ai/barefootjs) — monorepo (this crate lives at `packages/adapter-rust/runtime`)

## License

MIT
