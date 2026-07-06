---
"@barefootjs/php": minor
---

New engine-agnostic PHP runtime, extracted from `packages/adapter-twig/php` so it can be shared by every PHP templating backend. Ships the `Barefoot\BarefootJS` core (`encode_json`, `mark_raw`, `materialize`, `render_named`, `spread_attrs`, `omit`, `render_child`, ...) and the `Barefoot\Evaluator` expression evaluator, with no dependency on any specific template engine. `@barefootjs/twig`'s `TwigBackend` and `@barefootjs/blade`'s `BladeBackend` both implement the engine backend contract on top of this package (resolved via a composer `path` repository), so adding a new PHP template engine no longer requires re-porting the runtime.
