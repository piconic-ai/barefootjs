---
"@barefootjs/rust": minor
---

New Rust backend adapter targeting minijinja. `MinijinjaAdapter` is a
near-verbatim port of the Jinja2 adapter's (`@barefootjs/jinja`) IR
lowering — the emitted template syntax is IDENTICAL (`{{ … }}` / `{% if %}`
/ `{% for %}` / `{% set %}` / `{'k': v}` dict literals), since minijinja
2.x is Jinja2-compatible for everything this adapter emits. The package
bundles a Rust runtime (`packages/adapter-rust/runtime/`, crate
`barefootjs`) — a port of the Python `barefootjs` runtime with a
`backend_minijinja` module implementing the engine backend contract
(`encode_json`, `mark_raw`, `materialize`, `render_named`) on a
`minijinja::Environment` configured with `ChainableUndefined`,
`trim_blocks`/`lstrip_blocks`, HTML autoescape, and a custom formatter
(MarkupSafe-compatible `&#39;` escaping, JS-shaped number formatting).
Templates call the same snake_case `bf.<helper>` surface as every other
adapter, with `bf.truthy` / `bf.string` covering JS-vs-template-engine
semantic divergences. Runs under any Rust web framework (axum,
actix-web, warp, bare `hyper`, etc.) — no framework-specific glue required.
