# @barefootjs/jinja

Jinja2 adapter for BarefootJS: compiles the BarefootJS IR (JSX → IR, see
`spec/compiler.md`) into `.jinja` template files plus the client JS bundle
every other adapter produces, and ships a Python rendering runtime
(`python/barefootjs/`) that renders those templates through a plain
`jinja2.Environment` — no framework is required (Flask, Django, bare WSGI,
etc. all work the same way).

Near-mechanical port of `@barefootjs/xslate` (the Text::Xslate/Kolon
adapter) to Jinja2 syntax. See `src/adapter/jinja-adapter.ts`'s header
comment for the full Kolon↔Jinja syntax-mapping table and the JS/Python
semantics divergences this port handles uniformly (truthiness,
stringification, reserved-word identifier mangling, and the
evaluator-only higher-order-callback lowering since Jinja has no lambda
expression).

## Template output shape

- `name: 'jinja'`, `extension: '.jinja'`, `templatesPerComponent: true` —
  one `.jinja` file per component, named by snake-casing the PascalCase
  component name (`UserCard` → `user_card.jinja`).
- Hydration markers (`bf-s`, `bf-h`/`bf-m`/`bf-r`, `bf-p`, slot/conditional
  comment markers, loop boundary comments) use the SAME runtime method
  names as every other adapter's `bf.*` calls (`bf.scope_attr()`,
  `bf.hydration_attrs()`, `bf.text_start`/`text_end`, `bf.comment(...)`,
  …) — see `spec/template-helpers.md` for the shared helper contract.
- Every text/attribute interpolation of a possibly-non-string value is
  routed through `bf.string(...)` (or `bf.bool_str(...)` for
  boolean-shaped values); every non-comparison condition position is
  routed through `bf.truthy(...)`. Both are pure Python-runtime helpers —
  see the Python runtime pointer below.

## Python runtime

`python/barefootjs/` is a self-contained Python package (only dependency:
`jinja2`) implementing the engine-agnostic `bf` object every emitted
template calls into: hydration markers, context propagation
(`provide_context`/`use_context`), child-component rendering
(`render_child`), script registration, and the JS-compatible helper
library (`string`, `bool_str`, `truthy`, `number`, `floor`/`ceil`/`round`,
array/string helpers, the `*_eval` evaluator helpers, `spread_attrs`,
`query`, …). It mirrors the layering of `packages/adapter-perl/lib/` (an
engine-agnostic core plus a thin per-engine backend) — see
`spec/template-helpers.md` for the semantic contract each helper must
satisfy, and the package's own tests under `python/tests/`.

## Usage

```ts
// barefoot.config.ts
import { createConfig } from '@barefootjs/jinja/build'

export default createConfig({
  components: ['./src/components'],
  outDir: './dist',
})
```

`bf build` then emits `.jinja` templates + client JS under `outDir`. A
Python host renders a component by constructing a `jinja2.Environment`
(with `autoescape=True`, `undefined=jinja2.ChainableUndefined`,
`trim_blocks=True`, `lstrip_blocks=True` — see the adapter header comment
for why the last two are required) over a `FileSystemLoader` pointed at
the emitted templates, wiring in `barefootjs.backend_jinja` as the render
backend.
