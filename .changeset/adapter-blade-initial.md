---
"@barefootjs/blade": minor
---

New PHP backend adapter targeting Laravel Blade. `BladeAdapter` ports the Twig adapter's IR lowering to Blade syntax (`{!! e(…) !!}` / `@if` / `@elseif` / `@foreach`), and the package bundles a PHP runtime backend (`packages/adapter-blade/php/`) built on `illuminate/view` standalone (Filesystem + Dispatcher + EngineResolver/BladeCompiler + FileViewFinder + Factory) — a `BladeBackend` implementing the engine backend contract (`encode_json`, `mark_raw`, `materialize`, `render_named`, `ident`) on top of the shared engine-agnostic runtime (`@barefootjs/php`). Templates call the same snake_case `bf.<helper>` surface as the other PHP/Perl/Python adapters, with `bf.truthy` / `bf.eq` / `bf.neq` covering JS-vs-PHP semantic divergences (PHP truthiness, and PHP's `==`/`===` not matching JS strict equality).
