# @barefootjs/blade

Laravel Blade (PHP) adapter for BarefootJS: compiles the BarefootJS IR
(JSX → IR, see `spec/compiler.md`) into `.blade.php` template files plus the
client JS bundle every other adapter produces, and ships a PHP rendering
runtime (`php/src/`) that renders those templates through `illuminate/view`
used standalone — no Laravel application/container is required.

Near-mechanical port of `@barefootjs/twig` (the Twig adapter) to Blade
syntax. See `src/adapter/blade-adapter.ts`'s header comment for the full
Twig↔Blade syntax-mapping table and the JS/PHP semantics divergences this
port handles uniformly (truthiness, stringification, reserved-word
identifier mangling, `$bf->eq`/`$bf->neq` for JS strict equality, `data_get`
for polymorphic member/index access, and the evaluator-only higher-order-
callback lowering since Blade has no lambda expression).

## Template output shape

- `name: 'blade'`, `extension: '.blade.php'`, `templatesPerComponent: true` —
  one `.blade.php` file per component, named by snake-casing the PascalCase
  component name (`UserCard` → `user_card.blade.php`).
- Hydration markers (`bf-s`, `bf-h`/`bf-m`/`bf-r`, `bf-p`, slot/conditional
  comment markers, loop boundary comments) use the SAME runtime method
  names as every other adapter's `bf.*` calls, spelled as PHP method calls
  on the `$bf` variable (`$bf->scope_attr()`, `$bf->hydration_attrs()`,
  `$bf->text_start`/`text_end`, `$bf->comment(...)`, …) — see
  `spec/template-helpers.md` for the shared helper contract.
- Every text/attribute interpolation of a possibly-non-string value is
  routed through `$bf->string(...)` (or `$bf->bool_str(...)` for
  boolean-shaped values); every non-comparison condition position is
  routed through `$bf->truthy(...)`; every JS `===`/`!==` comparison routes
  through `$bf->eq(...)`/`$bf->neq(...)` (PHP's own `==`/`===` are either
  loose or number-representation-sensitive in ways that diverge from JS
  strict equality). All are pure PHP-runtime helpers — see the PHP runtime
  pointer below.

## PHP runtime

`php/src/` is a self-contained PHP package (dependencies: `illuminate/view`
and `barefootjs/runtime`) implementing the engine-agnostic `bf` object
every emitted template calls into: hydration markers, context propagation
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
import { createConfig } from '@barefootjs/blade/build'

export default createConfig({
  components: ['./src/components'],
  outDir: './dist',
})
```

`bf build` then emits `.blade.php` templates + client JS under `outDir`. A
PHP host renders a component by constructing an `illuminate/view` `Factory`
standalone (`Filesystem` + event `Dispatcher` + `EngineResolver` registering
a `blade` engine over a `BladeCompiler` + `FileViewFinder`, all wired
together by the `Factory` — see `php/src/BladeBackend.php`'s constructor)
pointed at the emitted templates, wiring in the PHP `BladeBackend` as the
render backend. Blade's `{{ }}` echo (`Illuminate\Support\e()`) emits named
HTML entity forms (`&quot;`/`&#039;` via `ENT_QUOTES`) where Perl/Go/
markupsafe emit the numeric `&#34;`/`&#39;` forms — see the adapter header
comment for how that byte-form difference is handled.
