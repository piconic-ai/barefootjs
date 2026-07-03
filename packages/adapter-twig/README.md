# @barefootjs/twig

Twig (PHP) adapter for BarefootJS: compiles the BarefootJS IR (JSX → IR, see
`spec/compiler.md`) into `.twig` template files plus the client JS bundle
every other adapter produces, and ships a PHP rendering runtime
(`php/src/`) that renders those templates through a plain `Twig\Environment`
— no framework is required (Slim, plain PHP, etc. all work the same way).

Near-mechanical port of `@barefootjs/jinja` (the Jinja2 adapter) to Twig
syntax. See `src/adapter/twig-adapter.ts`'s header comment for the full
Jinja↔Twig syntax-mapping table and the JS/PHP semantics divergences this
port handles uniformly (truthiness, stringification, reserved-word
identifier mangling, `bf.eq`/`bf.neq` for JS strict equality, and the
evaluator-only higher-order-callback lowering since Twig has no lambda
expression).

## Template output shape

- `name: 'twig'`, `extension: '.twig'`, `templatesPerComponent: true` —
  one `.twig` file per component, named by snake-casing the PascalCase
  component name (`UserCard` → `user_card.twig`).
- Hydration markers (`bf-s`, `bf-h`/`bf-m`/`bf-r`, `bf-p`, slot/conditional
  comment markers, loop boundary comments) use the SAME runtime method
  names as every other adapter's `bf.*` calls (`bf.scope_attr()`,
  `bf.hydration_attrs()`, `bf.text_start`/`text_end`, `bf.comment(...)`,
  …) — see `spec/template-helpers.md` for the shared helper contract.
- Every text/attribute interpolation of a possibly-non-string value is
  routed through `bf.string(...)` (or `bf.bool_str(...)` for
  boolean-shaped values); every non-comparison condition position is
  routed through `bf.truthy(...)`; every JS `===`/`!==` comparison routes
  through `bf.eq(...)`/`bf.neq(...)` (Twig's own `==`/`!=` compile to PHP
  loose equality, which is wrong for JS strict-equality semantics). All
  are pure PHP-runtime helpers — see the PHP runtime pointer below.

## PHP runtime

`php/src/` is a self-contained PHP package (only dependency: `twig/twig`)
implementing the engine-agnostic `bf` object every emitted template calls
into: hydration markers, context propagation
(`provide_context`/`use_context`), child-component rendering
(`render_child`), script registration, and the JS-compatible helper
library (`string`, `bool_str`, `truthy`, `number`, `floor`/`ceil`/`round`,
array/string helpers, the `*_eval` evaluator helpers, `spread_attrs`,
`query`, `eq`/`neq`, …). It mirrors the layering of
`packages/adapter-perl/lib/` (an engine-agnostic core plus a thin
per-engine backend) — see `spec/template-helpers.md` for the semantic
contract each helper must satisfy, and the package's own tests under
`php/tests/`.

## Usage

```ts
// barefoot.config.ts
import { createConfig } from '@barefootjs/twig/build'

export default createConfig({
  components: ['./src/components'],
  outDir: './dist',
})
```

`bf build` then emits `.twig` templates + client JS under `outDir`. A PHP
host renders a component by constructing a `Twig\Environment` (with
`autoescape: 'html'`, `strict_variables: false`, and a custom 'html'
escaper matching Perl/Go/markupsafe's numeric-entity output — see the
adapter header comment for why the default `htmlspecialchars` escaper
diverges) over a `FilesystemLoader` pointed at the emitted templates,
wiring in the PHP `TwigBackend` as the render backend.
