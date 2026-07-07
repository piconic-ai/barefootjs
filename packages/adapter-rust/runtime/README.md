# barefootjs

Rust runtime for [BarefootJS](https://barefootjs.dev/) marked templates, targeting [minijinja](https://crates.io/crates/minijinja).

[BarefootJS](https://github.com/piconic-ai/barefootjs) is a fine-grained reactive TSX compiler: you write components in TSX, and the compiler emits templates for your backend's template engine plus the client-side JS that hydrates them. This crate is the server half for Rust — it renders the templates produced by the `@barefootjs/rust` adapter.

## Installation

```sh
cargo add barefootjs
```

## Usage

Build a minijinja environment over the compiled template directory with `backend_minijinja::build_environment`, create a root `BfInstance` for the render (`BfInstance::root`), then render a named component template with `backend_minijinja::render_named`. `load_manifest` / `register_components_from_manifest` wire up the component manifest emitted by the compiler, and a `bf-render` binary is included for rendering from the command line.

Key modules:

| Module | Role |
|--------|------|
| `runtime` | the engine-agnostic `bf` object (`BfInstance`, `RenderSession`) |
| `backend_minijinja` | the minijinja engine backend |
| `evaluator` | ParsedExpr evaluator for the `*_eval` helpers |
| `manifest` | component manifest loading and registration |
| `search_params` | `searchParams()` SSR reader |

## Documentation

- [barefootjs.dev](https://barefootjs.dev/) — core documentation
- [GitHub: piconic-ai/barefootjs](https://github.com/piconic-ai/barefootjs) — monorepo (this crate lives at `packages/adapter-rust/runtime`)

## License

MIT
