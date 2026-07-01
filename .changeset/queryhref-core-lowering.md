---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
---

Lower `queryHref` through a default-applied built-in `LoweringPlugin` instead of a per-adapter recognition branch (#2057). Its runtime stays in `@barefootjs/client`; the compiler registers `queryHrefPlugin` by default, so each adapter (go-template / mojolicious / xslate) recognises `queryHref(base, { … })` through the same registry matcher loop as any userland plugin and renders it to its query helper (`bf_query` / `bf->query` / `$bf.query`). Adapters no longer carry a queryHref-specific branch. Output is unchanged — `queryHref` still lowers identically.
