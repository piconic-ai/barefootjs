---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
---

Retire the imperative `URLSearchParams` href-builder recognizer (#2042).

With `queryHref` shipped on every SSR adapter and the last usage migrated, the ad-hoc recognizer for the `(…) => { const u = new URLSearchParams(); … }` idiom is removed:

- `@barefootjs/jsx`: deleted `url-builder-shape.ts` (`recognizeUrlBuilder`), the `ConstantInfo.urlBuilder` field, and the `UrlBuilderInfo` / `UrlBuilderSet` types (compiler-internal surface added in #2039).
- `@barefootjs/go-template`: removed `lowerUrlBuilderHelperCall` and the builder emitter; `expr/url-builder.ts` now only lowers the structured `queryHref(base, { … })` call to `bf_query`.

No user-facing behavior change: components use `queryHref` (lowered structurally, no recognizer / re-parse). The trailing-slash `String.replace(/\/+$/, '')` → `strings.TrimRight` ctor lowering is independent and unchanged.
