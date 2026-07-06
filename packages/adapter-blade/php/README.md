# barefootjs/blade

Laravel Blade rendering backend (`Barefoot\BladeBackend`) for the BarefootJS
PHP runtime.

This package targets `illuminate/view` (used standalone -- no Laravel
application/container required) and pairs with the `@barefootjs/blade`
compile-time adapter, which emits `.blade.php` templates that call the
runtime as a `$bf` object (`{{ $bf->scope_attr() }}`, `{{ $bf->json($x) }}`,
`{{ $bf->spread_attrs($bag) }}`).

The engine-agnostic runtime itself (`Barefoot\BarefootJS`, `Evaluator`,
`SearchParams`, `Json`) lives in a separate package,
[`packages/adapter-php`](../../adapter-php) (`barefootjs/runtime` on
Composer) -- see that package's README for the backend contract every PHP
engine adapter (Twig, Blade, ...) implements.

This package is maintained in the BarefootJS monorepo and is mirrored to a
Packagist-facing repository only for Composer distribution.

- Source of truth: <https://github.com/piconic-ai/barefootjs/tree/main/packages/adapter-blade/php>
- Monorepo: <https://github.com/piconic-ai/barefootjs>
- npm adapter: `@barefootjs/blade`
- Runtime dependency: `barefootjs/runtime` (`packages/adapter-php`)

Do not send implementation pull requests to the Packagist mirror. Send changes to
the monorepo path above; the release workflow splits this directory and pushes the
mirror automatically.

## Tests

```sh
php tests/test_render.php
```

A live end-to-end Blade render (scope markers, hydration attrs, text slots,
autoescaping, `spread_attrs`, reserved-word mangling). Needs `illuminate/view`
installed (`composer install`); skips gracefully with a notice (not a
failure) when `vendor/autoload.php` is absent. The engine-agnostic runtime's
own test suite (golden helper vectors, evaluator vectors, `spread_attrs`,
`omit`, `render_child`, ...) lives in
[`packages/adapter-php/tests`](../../adapter-php/tests) — run with
`php packages/adapter-php/tests/run.php`.
