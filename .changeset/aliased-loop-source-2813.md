---
"@barefootjs/jsx": patch
"@barefootjs/blade": patch
"@barefootjs/erb": patch
"@barefootjs/go-template": patch
"@barefootjs/jinja": patch
"@barefootjs/mojolicious": patch
"@barefootjs/rust": patch
"@barefootjs/twig": patch
"@barefootjs/xslate": patch
---

Fix #2813: a `.map()` loop whose source is a local `const` alias of a signal getter (`const items__alias = items`) now renders correctly on every adapter, not just Hono. `ssr-defaults.ts` seeds the template stash under the alias name too (reusing `resolveGetterAliases`, the alias-hop walker #2778 introduced), and the Go adapter's `rootFieldRef` resolves a bare identifier/call through the same alias map before capitalizing it into a struct field.
