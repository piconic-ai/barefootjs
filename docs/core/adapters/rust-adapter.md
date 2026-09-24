---
title: Rust Adapter
description: Render BarefootJS components from Rust via minijinja — no framework required (axum, actix-web, warp).
---

# Rust Adapter

`@barefootjs/rust` compiles components to minijinja templates (`.j2`) rendered by the `barefootjs` crate over a [`minijinja::Environment`](https://docs.rs/minijinja). axum, actix-web, warp or bare `hyper` all work the same way.

## Install

```sh
npm install @barefootjs/rust
```

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import { barefoot } from '@barefootjs/rust/vite'

export default defineConfig({
  plugins: barefoot({ components: ['components'], templates: 'dist/templates' }),
})
```

Add the crate as a path dependency on the npm package's `runtime/` directory:

```toml
[dependencies]
barefootjs = { path = "node_modules/@barefootjs/rust/runtime" }
```

## Render from your server

Always build the `Environment` with `build_environment`. It sets `ChainableUndefined`, `trim_blocks`/`lstrip_blocks`, forced HTML auto-escaping and a formatter that escapes and formats numbers the way the other adapters do; a hand-built `Environment` renders differently. Each request gets a `RenderSession`, and `BfInstance::root` is the `bf` value for the root component:

```rust
use axum::{routing::get, Router};
use barefootjs::{backend_minijinja, BfInstance, JsValue, RenderSession};
use minijinja::Environment;
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::Arc;

async fn counter(env: Arc<Environment<'static>>) -> axum::response::Html<String> {
    let session = RenderSession::new();
    let root = BfInstance::root(Arc::clone(&session), "Counter_0");
    let vars = JsValue::Object(BTreeMap::from([("initial".to_string(), JsValue::Number(0.0))]));

    let body = backend_minijinja::render_named(&env, "counter", root.as_mj_value(), &vars).unwrap();
    axum::response::Html(format!("<!doctype html><body>{body}{}</body>", root.scripts()))
}

#[tokio::main]
async fn main() {
    let env = Arc::new(backend_minijinja::build_environment(&PathBuf::from("dist/templates")));
    let app = Router::new().route("/", get(move || counter(env.clone())));
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
```

## Notes

- Template names are the snake_cased component name: `UserCard` → `user_card.j2`.
- Props are `JsValue`s (a JSON-shaped value type); numbers are `f64`.
- Child components are resolved from the `manifest.json` that `vite build` writes next to the templates — `register_components_from_manifest` on the session; see `src/render.rs` in the axum example.
- The crate depends on `minijinja`, `serde` and `serde_json` only.

Example: [`integrations/axum`](https://github.com/piconic-ai/barefootjs/tree/main/integrations/axum).
