---
title: PHP Adapter
description: Render BarefootJS components from PHP — one runtime with Twig and Laravel Blade backends.
---

# PHP Adapter

Two packages compile components to PHP templates and share one runtime (Composer package `barefootjs/php`): `@barefootjs/twig` emits Twig (`.twig`) and `@barefootjs/blade` emits Laravel Blade (`.blade.php`). Neither needs a framework.

## Install

```sh
npm install @barefootjs/twig          # or @barefootjs/blade
composer require barefootjs/twig      # or barefootjs/blade — both pull in barefootjs/php
```

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import { barefoot } from '@barefootjs/twig/vite' // or '@barefootjs/blade/vite'

export default defineConfig({
  plugins: barefoot({ components: ['components'], templates: 'dist/templates' }),
})
```

## Render from your server

Point a backend at the emitted templates, construct the runtime over it, and render by template name. Twig and Blade differ only in the backend class:

```php
use Barefoot\BarefootJS;
use Barefoot\TwigBackend;   // or Barefoot\BladeBackend

$backend = new TwigBackend(['paths' => ['dist/templates']]);

$bf = new BarefootJS(null, ['backend' => $backend]);
$bf->_scope_id('Counter_' . random_int(0, 999_999));
$body = $backend->render_named('counter', $bf, ['initial' => 0]);
$html = "<!doctype html><body>{$body}{$bf->scripts()}</body>";
```

## Notes

- `TwigBackend` builds a `Twig\Environment` with `autoescape: 'html'` and `strict_variables: false`, the settings the templates assume. Pass `'env' => $env` to supply a pre-built Environment, or `'environment_options' => ['cache' => false, 'auto_reload' => true]` in development so rebuilt templates render on the next request.
- `BladeBackend` runs on `illuminate/view` standalone: it wires the `Filesystem`, `EngineResolver`, `BladeCompiler` and `FileViewFinder` itself, so no Laravel application or service container is required. Inside a Laravel app, [`integrations/laravel`](https://github.com/piconic-ai/barefootjs/tree/main/integrations/laravel) shows the wiring.
- Template names are the snake_cased component name: `UserCard` → `user_card.twig` / `user_card.blade.php`.
- Prop names that collide with engine keywords are mangled at render time (Twig: `for` → `for_`; Blade: `loop` → `loop_`).
- `===`/`!==` route through `bf.eq`/`bf.neq` because PHP's own comparisons diverge from JS strict equality; nothing to configure.

Examples: [`integrations/php`](https://github.com/piconic-ai/barefootjs/tree/main/integrations/php) (Twig) and [`integrations/blade`](https://github.com/piconic-ai/barefootjs/tree/main/integrations/blade).
