---
"@barefootjs/go-template": patch
"@barefootjs/jsx": patch
---

Carry the URL-query-builder and regex-`replace` shapes as pure IR, retiring the last emit-time `ts.createSourceFile` / `parseLiteralExpression` re-parses in the go-template adapter (#2039).

- The `URLSearchParams` helper idiom (`hrefFor` → `bf_query`) is recognised at analysis time and carried on `ConstantInfo.urlBuilder` as a pure `UrlBuilderInfo` (a builder shape, or a pass-through delegate). The go-template adapter consumes that IR instead of re-parsing the (block-bodied, otherwise-`unsupported`) arrow at emit time; the former adapter-side `extractUrlBuilder` / `matchUrlSet` are removed.
- The regex form of `String.replace` is now carried structurally (an `array-method` `replace` whose first arg is a `regex` node) rather than collapsing to `unsupported`, so the derived-memo constructor lowering recovers the `/\/+$/` trailing-slash strip → `strings.TrimRight` off the IR, with no `ts.createSourceFile` on the `bf build` hot path. Template use of a regex `.replace` stays refused with the same deferred-form diagnostic via `isSupported`.

No change to rendered HTML across the go-template, Mojolicious, and Xslate SSR adapters.
