---
title: PHP Adapter
description: Render BarefootJS components from PHP — one engine-agnostic runtime with Twig and Laravel Blade backends.
---

# PHP Adapter

Run the same JSX components on a PHP backend. BarefootJS compiles your JSX into
a **marked template** plus **client JS**; on the server, a small PHP runtime
renders those templates. The runtime is deliberately **template-engine- and
web-framework-agnostic**, so one implementation drives multiple stacks.

```
JSX → IR → marked template (.twig / .blade.php) + Component.client.js
                 │
                 ▼
   BarefootJS runtime  ──delegates──▶  pluggable backend
   (@barefootjs/php, `barefootjs/runtime`)   (Twig | Laravel Blade)
```

## Two backends, one runtime

| Backend | Template syntax | Compile-time package | Runtime | Where it runs |
|---------|-----------------|----------------------|---------|---------------|
| Twig | `{{ }}` / `{% %}` | `@barefootjs/twig` | `Barefoot\TwigBackend` | **any PHP web app** (Slim, plain PHP) — no framework |
| Laravel Blade | `{{ }}` / `@if` / `@foreach` | `@barefootjs/blade` | `Barefoot\BladeBackend` | `illuminate/view` standalone — no Laravel application/container required |

Both compile-time packages emit per-component template files and the shared
client JS, and both render through the same engine-agnostic PHP runtime
(`Barefoot\BarefootJS`, shipped by `@barefootjs/php` / Composer package
`barefootjs/runtime`). The only thing that differs is the **backend**: a tiny
object that implements the five operations the runtime delegates to.

Both adapters are near-mechanical ports of `@barefootjs/jinja` (the Jinja2
adapter — see the [Python Adapter](./python-adapter.md)) to their respective
template syntax, handling the JS/PHP semantics divergences (truthiness,
stringification, reserved-word identifier mangling, and evaluator-only
higher-order-callback lowering, since neither Twig nor Blade has a lambda
expression) in one uniform place.

### The backend contract

Everything that depends on *how* a template renders — JSON marshalling,
raw-string marking, JSX-children materialisation, named-template
rendering, and template-variable-name mangling — lives behind a backend
object with five methods:

| Method | Purpose |
|--------|---------|
| `encode_json($data)` | Serialize a value for `bf-p` props / inline JSON |
| `mark_raw($str)` | Mark already-safe HTML so the engine won't re-escape it |
| `materialize($value)` | Resolve captured JSX children to a string |
| `render_named($name, $bf, $vars)` | Render a child component's template |
| `ident($name)` | Mangle a prop name into an engine-safe template variable (Twig: grammar keywords like `for` → `for_`; Blade: render-scope collisions like `loop` → `loop_`) |

Because that is the *only* engine-specific surface, the runtime
(`Barefoot\BarefootJS` + `Barefoot\Evaluator`, in `packages/adapter-php/src/`)
is shared unchanged between `TwigBackend` and `BladeBackend`.

## Twig

```
npm install @barefootjs/twig
```

Configure the build (`barefoot.config.ts`):

```typescript
import { createConfig } from '@barefootjs/twig/build'

export default createConfig({
  components: ['./src/components'],
  outDir: './dist',
})
```

`bf build` emits `.twig` templates plus client JS under `outDir`. On the PHP
side, require `barefootjs/twig` via Composer and construct a
`Twig\Environment` over a `FilesystemLoader` pointed at the emitted
templates, wiring in the `TwigBackend` as the render backend:

```php
use Twig\Environment;
use Twig\Loader\FilesystemLoader;
use Barefoot\TwigBackend;

$loader = new FilesystemLoader('dist/templates');
$twig = new Environment($loader, [
    'autoescape' => 'html',
    'strict_variables' => false,
]);

$backend = new TwigBackend($twig);
$html = $backend->renderNamed('user_card', ['name' => 'Ada']);
```

Twig's default escaper emits `&quot;`/`&#039;` for `"`/`'`, where the
Perl/Go/Python adapters emit the numeric `&#34;`/`&#39;` forms — the adapter
accounts for this byte-form difference so output stays consistent across
backends.

## Laravel Blade

```
npm install @barefootjs/blade
```

Configure the build (`barefoot.config.ts`):

```typescript
import { createConfig } from '@barefootjs/blade/build'

export default createConfig({
  components: ['./src/components'],
  outDir: './dist',
})
```

`bf build` emits `.blade.php` templates plus client JS under `outDir`. Blade
runs on `illuminate/view` used **standalone** — no Laravel application or
service container required. Construct a `Factory` (`Filesystem` + an event
`Dispatcher` + an `EngineResolver` registering a `blade` engine over a
`BladeCompiler` + a `FileViewFinder`, all wired together by the `Factory` —
see `Barefoot\BladeBackend`'s constructor) pointed at the emitted templates,
wiring in the `BladeBackend` as the render backend:

```php
use Barefoot\BladeBackend;

$backend = new BladeBackend([
    'paths' => ['dist/templates'],
]);

$html = $backend->renderNamed('user_card', ['name' => 'Ada']);
```

Blade's `{{ }}` echo (`Illuminate\Support\e()`) emits named HTML entity forms
(`&quot;`/`&#039;` via `ENT_QUOTES`) where Perl/Go/markupsafe emit the numeric
`&#34;`/`&#39;` forms — the adapter accounts for this byte-form difference so
output stays consistent across backends.

## Template output shape

Both backends share the same hydration-marker contract:

- One template file per component, named by snake-casing the PascalCase
  component name (`UserCard` → `user_card.twig` / `user_card.blade.php`).
- Hydration markers use the same runtime method names as every other
  adapter's `bf.*` calls, spelled as PHP method calls on the `$bf` variable
  (`bf.scope_attr()` / `$bf->scope_attr()`, `bf.hydration_attrs()` /
  `$bf->hydration_attrs()`, `text_start`/`text_end`, `comment(...)`, …) — see
  [`spec/template-helpers.md`](https://github.com/piconic-ai/barefootjs/blob/main/spec/template-helpers.md)
  for the shared helper contract.
- Every text/attribute interpolation of a possibly-non-string value is routed
  through `string(...)` (or `bool_str(...)` for boolean-shaped values); every
  non-comparison condition position is routed through `truthy(...)`; every JS
  `===`/`!==` comparison routes through `eq(...)`/`neq(...)` — PHP's own
  `==`/`===` are either loose or number-representation-sensitive in ways that
  diverge from JS strict equality.

## PHP runtime

`packages/adapter-php` (Composer package `barefootjs/runtime`, npm package
`@barefootjs/php`) is a self-contained, engine-agnostic PHP package with no
template-engine dependency. It implements the `bf` object every emitted
template calls into: hydration markers, context propagation
(`provide_context`/`use_context`), child-component rendering
(`render_child`), script registration, and the JS-compatible helper library
(`string`, `bool_str`, `truthy`, `number`, `floor`/`ceil`/`round`,
array/string helpers, `spread_attrs`, `query`, `eq`/`neq`, …). `TwigBackend`
(`packages/adapter-twig/php/`, Composer package `barefootjs/twig`) and
`BladeBackend` (`packages/adapter-blade/php/`, Composer package
`barefootjs/blade`) both depend on it via a composer `path` repository, so
adding a third PHP template engine means implementing the five-method backend
contract above, not re-porting the runtime.

## Examples

Runnable end-to-end apps that render the same shared components on a PHP
backend live under
[`integrations/php`](https://github.com/piconic-ai/barefootjs/tree/main/integrations/php)
(Twig) and
[`integrations/blade`](https://github.com/piconic-ai/barefootjs/tree/main/integrations/blade)
(Blade).

## See also

- [Python Adapter](./python-adapter.md) — the Jinja2 adapter this port maps from
- [Adapter Architecture](./adapter-architecture.md) — the `TemplateAdapter` interface and IR contract
- [Writing a Custom Adapter](./custom-adapter.md)
