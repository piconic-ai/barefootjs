---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
---

Recognise `queryHref` as a core built-in lowering rather than a registry plugin (#2057). Its runtime stays in `@barefootjs/client`, so each adapter (go-template / mojolicious / xslate) recognises the `queryHref(base, { … })` call directly — before the `LoweringPlugin` registry matcher loop — and lowers it to its query helper (`bf_query` / `bf->query` / `$bf.query`). The compiler core registers no plugin of its own; the registry remains the extension seam for lowerings the core does not know. Output is unchanged — `queryHref` still lowers identically.
