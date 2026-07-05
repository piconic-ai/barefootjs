---
title: Python Adapter
description: Render BarefootJS components from Python via Jinja2 — no framework required (Flask, Django, bare WSGI).
---

# Python Adapter

Run the same JSX components on a Python backend. BarefootJS compiles your
JSX into a **Jinja2 marked template** plus **client JS**; on the server, a
small Python runtime (`barefootjs`) renders those templates through a plain
`jinja2.Environment` — no framework is required, so Flask, Django, or bare
WSGI all work the same way.

```
JSX → IR → marked template (.jinja) + Component.client.js
                 │
                 ▼
   BarefootJS runtime  ──delegates──▶  jinja2.Environment
   (python/barefootjs/)
```

This adapter is a near-mechanical port of `@barefootjs/xslate` (the
Text::Xslate/Kolon adapter — see the [Perl Adapter](./perl-adapter.md)) to
Jinja2 syntax, handling the JS/Python semantics divergences (truthiness,
stringification, reserved-word identifier mangling, and evaluator-only
higher-order-callback lowering, since Jinja has no lambda expression) in one
uniform place rather than per fixture.

## Template output shape

- One `.jinja` file per component, named by snake-casing the PascalCase
  component name (`UserCard` → `user_card.jinja`).
- Hydration markers use the same runtime method names as every other
  adapter's `bf.*` calls (`bf.scope_attr()`, `bf.hydration_attrs()`,
  `bf.text_start`/`text_end`, `bf.comment(...)`, …).
- Every text/attribute interpolation of a possibly-non-string value is
  routed through `bf.string(...)` (or `bf.bool_str(...)` for boolean-shaped
  values); every non-comparison condition position is routed through
  `bf.truthy(...)`.

## Python runtime

`python/barefootjs/` (shipped inside `@barefootjs/jinja`) is a
self-contained Python package with only one dependency, `jinja2`. It
implements the engine-agnostic `bf` object every emitted template calls
into: hydration markers, context propagation
(`provide_context`/`use_context`), child-component rendering
(`render_child`), script registration, and the JS-compatible helper library
(`string`, `bool_str`, `truthy`, `number`, `floor`/`ceil`/`round`,
array/string helpers, `spread_attrs`, `query`, …).

## Usage

```
npm install @barefootjs/jinja
```

Configure the build (`barefoot.config.ts`):

```typescript
import { createConfig } from '@barefootjs/jinja/build'

export default createConfig({
  components: ['./src/components'],
  outDir: './dist',
})
```

`bf build` emits `.jinja` templates plus client JS under `outDir`. On the
Python side, vendor `python/barefootjs/` (from `@barefootjs/jinja`) into
your app and render a component by constructing a `jinja2.Environment` over
a `FileSystemLoader` pointed at the emitted templates, with the exact
settings this adapter's output assumes:

```python
import jinja2
from barefootjs import backend_jinja

env = jinja2.Environment(
    loader=jinja2.FileSystemLoader("dist/templates"),
    autoescape=True,
    undefined=jinja2.ChainableUndefined,
    trim_blocks=True,
    lstrip_blocks=True,
)

html = backend_jinja.render_named(env, "user_card", vars={"name": "Ada"})
```

`trim_blocks`/`lstrip_blocks` are required because the adapter places
`{% … %}` control tags on their own source line; `ChainableUndefined` is
required so a missing nested attribute (`missing.deep`) renders as empty
rather than raising.

## See also

- [Perl Adapter](./perl-adapter.md) — the Text::Xslate/Kolon adapter this port maps from
- [Rust Adapter](./rust-adapter.md) — a near-verbatim port of this adapter targeting minijinja, with identical template output
- [Adapter Architecture](./adapter-architecture.md) — the `TemplateAdapter` interface and IR contract
- [Writing a Custom Adapter](./custom-adapter.md)
