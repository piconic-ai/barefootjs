---
"@barefootjs/jsx": minor
"@barefootjs/go-template": patch
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
---

Introduce a backend-neutral call-lowering plugin registry (#2057, part 2).

The compiler core no longer hardcodes how a pure builder call like `queryHref(base, { … })` is recognized and lowered. A lowering plugin *matches* a call to a backend-neutral `LoweringNode`; each adapter *renders* that node in its own template syntax (`bf_query` / `bf->query` / `$bf.query`). This is a two-layer split — recognition is adapter-agnostic, rendering is plugin-agnostic — so SSR/CSR parity is enforced once, not per plugin.

New `@barefootjs/jsx` exports: `registerLoweringPlugin`, `prepareLoweringMatchers`, `matchLoweringCall`, `getLoweringPlugins`, and the `LoweringPlugin` / `LoweringNode` / `LoweringMatcher` types. `queryHref` is still registered by core for now; a later change relocates that registration to the router layer so core carries no runtime-API names.

Output is byte-identical: the Go / Mojolicious / Xslate adapters now obtain their query lowering through the registry instead of a hardcoded `queryHref` recognizer, producing the same templates as before.
