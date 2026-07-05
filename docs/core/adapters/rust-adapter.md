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

This adapter's output assumes an `Environment` constructed exactly as
follows:

```rust
let mut env = Environment::new();
env.set_loader(minijinja::path_loader(templates_dir)); // .j2 files
env.set_undefined_behavior(UndefinedBehavior::Chainable); // == Jinja2's ChainableUndefined
env.set_trim_blocks(true);
env.set_lstrip_blocks(true);
env.set_auto_escape_callback(|_| AutoEscape::Html); // REQUIRED: .j2 is not auto-escaped by default
env.set_formatter(barefootjs::formatter); // absorbs the remaining JS/minijinja semantic differences
```

`trim_blocks`/`lstrip_blocks` are required because `{% … %}` control tags
sit on their own source line; without them every such line leaks a stray
newline/indentation into the rendered HTML. The custom formatter escapes
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
side, depend on the `barefootjs` crate and construct a
`minijinja::Environment` (per the contract above) over
`minijinja::path_loader` pointed at the emitted templates, wiring in
`backend_minijinja` as the render backend:

```rust
use axum::{routing::get, Router};
use barefootjs::{backend_minijinja::render_named, BarefootJS};

async fn user_card() -> axum::response::Html<String> {
    let mut bf = BarefootJS::new();
    let html = render_named("user_card", &mut bf, Default::default());
    axum::response::Html(html)
}

#[tokio::main]
async fn main() {
    let app = Router::new().route("/", get(user_card));
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
```

The crate also ships a `bf-render` binary, a conformance renderer used by
the adapter's own test suite (`cargo build --bin bf-render`); a production
host links the `barefootjs` library crate directly, as above, rather than
shelling out to the binary.

## See also

- [Python Adapter](./python-adapter.md) — the Jinja2 adapter this is a near-verbatim port of, with identical template syntax
- [Adapter Architecture](./adapter-architecture.md) — the `TemplateAdapter` interface and IR contract
- [Writing a Custom Adapter](./custom-adapter.md)
