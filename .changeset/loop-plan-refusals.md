---
"@barefootjs/jsx": patch
"@barefootjs/erb": patch
"@barefootjs/mojolicious": patch
"@barefootjs/jinja": patch
"@barefootjs/rust": patch
"@barefootjs/pebble": patch
"@barefootjs/twig": patch
"@barefootjs/blade": patch
"@barefootjs/xslate": patch
---

Record a loop plan's refusals in one place across the eight DSL adapters (#3473). `DslTemplateAdapter.recordLoopPlanRefusals` reports BF104 for a destructure pattern no template binds and BF101 for a loop source that names an unresolvable computed const. Each adapter now supplies only the wording, as a `LoopRefusalSpelling`. ERB, Xslate and Mojolicious also move their loop headers into small private methods, which brings every DSL adapter's `renderLoop` to cognitive complexity 25 or below. The generated templates and diagnostics do not change.
