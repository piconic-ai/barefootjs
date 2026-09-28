---
"@barefootjs/vite": patch
"@barefootjs/blade": patch
"@barefootjs/erb": patch
"@barefootjs/go-template": patch
"@barefootjs/hono": patch
"@barefootjs/jinja": patch
"@barefootjs/mojolicious": patch
"@barefootjs/pebble": patch
"@barefootjs/rust": patch
"@barefootjs/twig": patch
"@barefootjs/xslate": patch
---

The `vite` peer range of `@barefootjs/vite` and of every adapter's `/vite` builder is now `^6.0.0 || ^7.0.0 || ^8.0.0`. Installing on Vite 7 or 8 no longer reports an unmet peer. The plugin imports only Vite's types. CI now runs every adapter builder's `vite build` tests and the `integrations/csr` E2E suite against each of these majors.
