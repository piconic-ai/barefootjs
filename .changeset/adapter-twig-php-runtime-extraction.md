---
"@barefootjs/twig": patch
---

No behavior change. Documentation-only update reflecting that the PHP runtime `@barefootjs/twig` depends on (`Barefoot\BarefootJS`) now lives in the standalone `@barefootjs/php` package rather than inside `packages/adapter-twig/php/src/`, so it can be shared with `@barefootjs/blade` and future PHP template-engine adapters.
