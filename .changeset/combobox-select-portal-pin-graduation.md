---
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

Drop the `combobox` and `select` render-divergence declarations: these adapters already render their SSR portal content in the same place as the Hono reference. On `@barefootjs/go-template`, the two fixtures now cite `nested-child-dynamic-boolean-prop-dropped`, the Go-only gap that remains once the portal pin is gone.
