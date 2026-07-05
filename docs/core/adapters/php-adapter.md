---
title: PHP Adapter
description: Render BarefootJS components from PHP via Twig — no framework required (Slim, plain PHP).
---

# PHP Adapter

Run the same JSX components on a PHP backend. BarefootJS compiles your JSX
into a **Twig marked template** plus **client JS**; on the server, a small
PHP runtime renders those templates through a plain `Twig\Environment` — no
framework is required, so Slim, plain PHP, or any PHP web app all work the
same way.

```
JSX → IR → marked template (.twig) + Component.client.js
                 │
                 ▼
   BarefootJS runtime  ──delegates──▶  Twig\Environment
   (php/src/, package barefootjs/twig)
```

This adapter is a near-mechanical port of `@barefootjs/jinja` (the Jinja2
adapter — see the [Python Adapter](./python-adapter.md)) to Twig syntax,
handling the JS/PHP semantics divergences (truthiness, stringification,
reserved-word identifier mangling, and evaluator-only higher-order-callback
lowering, since Twig has no lambda expression) in one uniform place.

## Template output shape

- One `.twig` file per component, named by snake-casing the PascalCase
  component name (`UserCard` → `user_card.twig`).
- Hydration markers use the same runtime method names as every other
  adapter's `bf.*` calls (`bf.scope_attr()`, `bf.hydration_attrs()`,
  `bf.text_start`/`text_end`, `bf.comment(...)`, …).
- Every text/attribute interpolation of a possibly-non-string value is
  routed through `bf.string(...)` (or `bf.bool_str(...)` for boolean-shaped
  values); every non-comparison condition position is routed through
  `bf.truthy(...)`; every JS `===`/`!==` comparison routes through
  `bf.eq(...)`/`bf.neq(...)` — Twig's own `==`/`!=` compile to PHP loose
  equality, which is wrong for JS strict-equality semantics.

## PHP runtime

`php/src/` (shipped inside `@barefootjs/twig`, Composer package
`barefootjs/twig`) is a self-contained PHP package requiring only
`twig/twig` (^3.10) and PHP >=8.2. It implements the engine-agnostic `bf`
object every emitted template calls into: hydration markers, context
propagation (`provide_context`/`use_context`), child-component rendering
(`render_child`), script registration, and the JS-compatible helper library
(`string`, `bool_str`, `truthy`, `number`, `floor`/`ceil`/`round`,
array/string helpers, `spread_attrs`, `query`, `eq`/`neq`, …).

## Usage

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

## See also

- [Python Adapter](./python-adapter.md) — the Jinja2 adapter this port maps from
- [Adapter Architecture](./adapter-architecture.md) — the `TemplateAdapter` interface and IR contract
- [Writing a Custom Adapter](./custom-adapter.md)
