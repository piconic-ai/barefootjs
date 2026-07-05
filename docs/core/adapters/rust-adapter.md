---
title: Rust Adapter
description: Render BarefootJS components from Rust via minijinja — no framework required (axum, actix-web, warp).
---

# Rust Adapter

Run the same JSX components on a Rust backend. BarefootJS compiles your JSX
into a **minijinja marked template** plus **client JS**; on the server, a
small Rust runtime (crate `barefootjs`) renders those templates through a
plain [`minijinja::Environment`](https://docs.rs/minijinja) — no framework
is required, so axum, actix-web, warp, or bare `hyper` all work the same
way.

```
JSX → IR → marked template (.j2) + Component.client.js
                 │
                 ▼
   BarefootJS runtime  ──delegates──▶  minijinja::Environment
   (runtime/, crate barefootjs)
```

This adapter is a near-verbatim port of `@barefootjs/jinja` (the Python
adapter — see the [Python Adapter](./python-adapter.md)) to the `minijinja`
Rust crate. **The emitted template syntax is identical** to
`@barefootjs/jinja`'s output — minijinja 2.21 is Jinja2-compatible for
everything this adapter emits. Only the identity fields differ (`.j2`
extension) plus the render engine that interprets the syntax at request
time (a Rust `minijinja::Environment` instead of Python's
`jinja2.Environment`).

## Template output shape

- One `.j2` file per component, named by snake-casing the PascalCase
  component name (`UserCard` → `user_card.j2`).
- Hydration markers use the same runtime method names as every other
  adapter's `bf.*` calls (`bf.scope_attr()`, `bf.hydration_attrs()`,
  `bf.text_start`/`text_end`, `bf.comment(...)`, …).
- Every text/attribute interpolation of a possibly-non-string value is
  routed through `bf.string(...)` (or `bf.bool_str(...)` for boolean-shaped
  values); every non-comparison condition position is routed through
  `bf.truthy(...)`.

## The minijinja Environment contract

This adapter's output assumes an `Environment` built with a specific set of
options — `ChainableUndefined`, `trim_blocks`/`lstrip_blocks`, HTML
auto-escaping forced on, and a custom formatter. Rather than assembling
these yourself, call the crate's `build_environment`, which constructs the
`Environment` per that contract:

```rust
use barefootjs::backend_minijinja::build_environment;

let env = build_environment(templates_dir); // .j2 files
```

`trim_blocks`/`lstrip_blocks` are required because `{% … %}` control tags
sit on their own source line; without them every such line leaks a stray
newline/indentation into the rendered HTML. The internal formatter escapes
strings with MarkupSafe-compatible entities (`&#39;`, not minijinja's
default `&#x27;`) and formats numbers with JS `String(n)` semantics
(`1.0` → `1`), matching every other adapter's byte-for-byte output.

## Rust runtime

`runtime/` (crate `barefootjs`, deps: `minijinja`, `serde`, `serde_json`)
implements the engine-agnostic `bf` object every emitted template calls
into: hydration markers, context propagation
(`provide_context`/`use_context`), child-component rendering
(`render_child`), script registration, and the JS-compatible helper library
(`string`, `bool_str`, `truthy`, `number`, `floor`/`ceil`/`round`,
array/string helpers, `spread_attrs`, `query`, …).

## Usage

```
npm install @barefootjs/rust
```

Configure the build (`barefoot.config.ts`):

```typescript
import { createConfig } from '@barefootjs/rust/build'

export default createConfig({
  components: ['./src/components'],
  outDir: './dist',
})
```

`bf build` emits `.j2` templates plus client JS under `outDir`. On the Rust
side, depend on the `barefootjs` crate, build the `Environment` via
`build_environment` (per the contract above), and render a component
through a `RenderSession` + root `BfInstance`:

```rust
use axum::{routing::get, Router};
use barefootjs::{backend_minijinja, BfInstance, JsValue, RenderSession};
use minijinja::Environment;
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::Arc;

async fn user_card(env: Arc<Environment<'static>>) -> axum::response::Html<String> {
    let session = RenderSession::new();
    let root = BfInstance::root(Arc::clone(&session), "UserCard_0");
    let vars = JsValue::Object(BTreeMap::from([("name".to_string(), JsValue::String("Ada".into()))]));

    let html = backend_minijinja::render_named(&env, "user_card", root.as_mj_value(), &vars).unwrap();
    axum::response::Html(html)
}

#[tokio::main]
async fn main() {
    let env = Arc::new(backend_minijinja::build_environment(&PathBuf::from("dist/templates")));
    let app = Router::new().route("/", get(move || user_card(env.clone())));
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
```

A full runnable app wiring this up with manifest-driven child-component
registration lives at
[`integrations/axum`](https://github.com/piconic-ai/barefootjs/tree/main/integrations/axum)
(see `src/render.rs`'s `render_component` for the production-shaped version
of the snippet above). The crate also ships a `bf-render` binary, a
conformance renderer used by the adapter's own test suite (`cargo build
--bin bf-render`) — most hosts should link the `barefootjs` library crate
directly, as above, rather than shelling out to the binary.

## See also

- [Python Adapter](./python-adapter.md) — the Jinja2 adapter this is a near-verbatim port of, with identical template syntax
- [Adapter Architecture](./adapter-architecture.md) — the `TemplateAdapter` interface and IR contract
- [Writing a Custom Adapter](./custom-adapter.md)
