---
"@barefootjs/jsx": patch
"@barefootjs/hono": patch
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

Known limitations now live in an in-repo registry (`packages/adapter-tests/limitations/<id>.ts`) instead of the `known-limitation` GitHub label. `ConformancePin.issue` is replaced by the required `limitation` id, `unescapable` becomes a bare `true`, and `RenderDivergences` values cite a limitation id instead of a prose reason. Every adapter's `conformancePins` cites the registry accordingly.
