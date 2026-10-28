---
"@barefootjs/jsx": patch
"@barefootjs/blade": patch
"@barefootjs/erb": patch
"@barefootjs/go-template": patch
"@barefootjs/jinja": patch
"@barefootjs/mojolicious": patch
"@barefootjs/pebble": patch
"@barefootjs/rust": patch
"@barefootjs/twig": patch
"@barefootjs/xslate": patch
---

The template adapters now leave out an attribute whose value is a method call that returns `undefined`, as Hono does (#3707). These calls are `.at(i)` with `i` out of range (`data-last={word.at(-1)}` with `word: ''`) and `.find()` / `.findLast()` with no match. They used to render `data-last=""`. `attrValueMayBeNullish` now counts these calls, so each adapter's existing nil guard covers them. A present value still renders, including `0` and `''`. On go-template, a memo over `.at(i)` (`createMemo(() => w().at(-1))`) was seeded `nil`, so an attribute bound to it was left out even when the value was present. The seed now calls the runtime's `bf.At`. The `undefined-method-result-attr` limitation and its `dataPointDivergences` pins are removed.
