# @barefootjs/rust

minijinja (Rust) adapter for BarefootJS: compiles the BarefootJS IR (JSX →
IR, see `spec/compiler.md`) into `.j2` template files plus the client JS
bundle every other adapter produces, and ships a Rust rendering runtime
(`runtime/`, crate `barefootjs`) that renders those templates through a
plain [`minijinja::Environment`](https://docs.rs/minijinja) — no framework
is required (axum, actix-web, warp, bare `hyper`, etc. all work the same
way).

Near-verbatim port of `@barefootjs/jinja` (the Jinja2/Python adapter) to the
`minijinja` Rust crate. **The emitted template syntax is IDENTICAL** to
`@barefootjs/jinja`'s output — minijinja 2.21 is Jinja2-compatible for
everything this adapter emits (verified by an orchestrator spike; see the
Environment contract below). Only identity fields differ (`name: 'minijinja'`,
`extension: '.j2'`, class `MinijinjaAdapter`) plus the render engine that
interprets the syntax at request time (a Rust `minijinja::Environment`
instead of Python's `jinja2.Environment`). See
`src/adapter/minijinja-adapter.ts`'s header comment for the full
Kolon↔Jinja2 syntax-mapping table (inherited unchanged from `@barefootjs/jinja`)
and the JS-semantics divergences this port handles uniformly (truthiness,
stringification, reserved-word identifier mangling, and the
evaluator-only higher-order-callback lowering since Jinja has no lambda
expression).

## Template output shape

- `name: 'minijinja'`, `extension: '.j2'`, `templatesPerComponent: true` —
  one `.j2` file per component, named by snake-casing the PascalCase
  component name (`UserCard` → `user_card.j2`).
- Hydration markers (`bf-s`, `bf-h`/`bf-m`/`bf-r`, `bf-p`, slot/conditional
  comment markers, loop boundary comments) use the SAME runtime method
  names as every other adapter's `bf.*` calls (`bf.scope_attr()`,
  `bf.hydration_attrs()`, `bf.text_start`/`text_end`, `bf.comment(...)`,
  …) — see `spec/template-helpers.md` for the shared helper contract.
- Every text/attribute interpolation of a possibly-non-string value is
  routed through `bf.string(...)` (or `bf.bool_str(...)` for
  boolean-shaped values); every non-comparison condition position is
  routed through `bf.truthy(...)`. Both are pure Rust-runtime helpers —
  see the Rust runtime pointer below.

## The minijinja Environment contract

This adapter's output assumes an `Environment` constructed exactly as
follows (see `runtime/src/backend_minijinja.rs`):

```rust
let mut env = Environment::new();
env.set_loader(minijinja::path_loader(templates_dir)); // .j2 files
env.set_undefined_behavior(UndefinedBehavior::Chainable); // == Jinja2's ChainableUndefined; `missing.deep` renders '' — verified
env.set_trim_blocks(true);
env.set_lstrip_blocks(true);
env.set_auto_escape_callback(|_| AutoEscape::Html); // REQUIRED: .j2 is not auto-escaped by default in minijinja
env.set_formatter(<custom formatter>);
```

`trim_blocks`/`lstrip_blocks` are required because this adapter places
`{% … %}` control tags on their own source line; without them every such
line would leak a stray newline/indentation into the rendered HTML.

The **custom formatter** is the uniform emit policy that absorbs the
remaining JS/minijinja semantic differences (no per-fixture hacks anywhere —
all divergence-absorption lives here plus in the `bf` runtime helpers):

- `undefined`/`none` → print nothing
- safe values → raw passthrough
- strings → escape with MarkupSafe-compatible entities: `&` → `&amp;`, `<` →
  `&lt;`, `>` → `&gt;`, `"` → `&quot;`, `'` → `&#39;` — **not** minijinja's
  own default `&#x27;`; the conformance fixtures pin `&#39;` (matching
  Python's MarkupSafe, which `@barefootjs/jinja`'s output also relies on)
- numbers → JS `String(n)` formatting (`1.0` → `1`) via the centralized
  `format_js_number` — this is a **fallback**; templates normally already
  route a value through `bf.string(...)` before it reaches the formatter
- bools → `true`/`false`

### minijinja↔Jinja2 divergence record (orchestrator spike, minijinja 2.21.0)

Verified compatible before committing to the near-verbatim port strategy:

- `{{ missing }}` → `''`; `{% if missing.deep %}` → falsy, renders `''`
  under `UndefinedBehavior::Chainable`
- `(x if (x is defined and x is not none) else 'FB')` → `'FB'` for both
  undefined AND `none`, the value otherwise ⇒ `@barefootjs/jinja`'s `??`
  lowering ports verbatim
- `{% set cap %}…{% endset %}` works; dict literals, `elif`, `loop.index0`,
  `{% set %}` inside `{% for %}`, `~` concat, `| safe` all work identically
  to Python's Jinja2
- method calls on a custom `Object` (`bf.to_str(42)`) work via
  `Object::call_method`
- minijinja truthiness is Python-like (empty list/map/str are falsy) — same
  as Python's Jinja2, and the reason JS truthiness MUST go through
  `bf.truthy(...)` (the adapter already emits this, unchanged from the
  Jinja2 port)

No divergence found that required a per-fixture special case; every
absorption point above is uniform (formatter, `bf` helper, or adapter emit
rule).

## Rust runtime

`runtime/` is a self-contained Rust crate (`barefootjs`, deps: `minijinja`,
`serde`, `serde_json`) implementing the engine-agnostic `bf` object every
emitted template calls into: hydration markers, context propagation
(`provide_context`/`use_context`), child-component rendering
(`render_child`), script registration, and the JS-compatible helper library
(`string`, `bool_str`, `truthy`, `number`, `floor`/`ceil`/`round`,
array/string helpers, the `*_eval` evaluator helpers, `spread_attrs`,
`query`, …). It mirrors the layering of `packages/adapter-jinja/python/barefootjs/`
(an engine-agnostic core plus a thin per-engine backend) — see
`spec/template-helpers.md` for the semantic contract each helper must
satisfy, and the crate's own tests under `runtime/tests/`.

The crate also ships a `bf-render` binary — a conformance renderer that
reads a JSON payload (`templates_dir`, `entry`, `scope_id`, `vars`,
`search_params?`, `children[]`) and writes the rendered HTML to stdout. It
is what `src/test-render.ts` builds (once, memoized — `cargo build
--manifest-path runtime/Cargo.toml --bin bf-render`) and spawns per
conformance fixture; a production host would instead link the `barefootjs`
library crate directly (see the axum sketch below) rather than shelling out
to the binary.

## Usage

```ts
// barefoot.config.ts
import { createConfig } from '@barefootjs/rust/build'

export default createConfig({
  components: ['./src/components'],
  outDir: './dist',
})
```

`bf build` then emits `.j2` templates + client JS under `outDir`. A Rust
host renders a component by constructing a `minijinja::Environment` (per
the contract above) over `minijinja::path_loader` pointed at the emitted
templates, wiring in the `barefootjs` crate's `backend_minijinja` module as
the render backend:

```rust
use axum::{routing::get, Router};
use barefootjs::{backend_minijinja::render_named, BarefootJS};

async fn user_card() -> axum::response::Html<String> {
    let mut bf = BarefootJS::new();
    let html = render_named("user_card", &mut bf, /* vars */ Default::default());
    axum::response::Html(html)
}

#[tokio::main]
async fn main() {
    let app = Router::new().route("/", get(user_card));
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
```

## Divergences from `@barefootjs/jinja`

Beyond the identity fields (`name`, `extension`, class name) and the render
engine itself, this is a near-verbatim port. Places the TypeScript side
could not port byte-for-byte from `@barefootjs/jinja`, all in
`src/test-render.ts` (the conformance-render harness, not the adapter
itself — the emitted template syntax is unaffected):

- **Render invocation.** `@barefootjs/jinja` generates a throwaway Python
  *script* per fixture (inline Python source building a props dict +
  per-child renderer closures) and shells out to `python3`. This adapter
  instead serializes the same information to a JSON *payload* and spawns
  one long-lived compiled `bf-render` binary, built once per test run.
- **Non-finite numbers.** JSON cannot represent `NaN`/`Infinity`/`-Infinity`
  — the TS side recursively encodes them as `{"__bf_special": "nan" | "inf"
  | "-inf"}` before `JSON.stringify`; `bf-render` decodes the sentinel back
  to the corresponding `f64` after parsing.
- **`vars` keys are unmangled.** Like `@barefootjs/jinja`'s Python props
  dict, the JSON payload's `vars` keys are the RAW prop/signal/memo names;
  reserved-word mangling happens in ONE place backend-side (the Rust
  runtime's `render_named`, mirroring the Python runtime's `render_named`).
