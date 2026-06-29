---
"@barefootjs/client": minor
"@barefootjs/go-template": patch
"@barefootjs/jsx": patch
---

Add `queryHref` — a pure, functional URL-query builder (#2042).

`queryHref(base, { … })` is the build counterpart to `searchParams()` (the reactive reader): instead of imperatively mutating a `URLSearchParams`, pass a params object. Each entry is included iff its value is truthy (so a conditional include folds into the value as `cond ? value : undefined`); values are encoded with `URLSearchParams`. It runs natively on the client and is a pure function (no reactivity).

The go-template adapter lowers a `queryHref(base, { … })` call to `bf_query` directly — because the call and its object literal are already structured IR, there is no block-body recognizer and no emit-time re-parse. This is the functional alternative to the imperative `URLSearchParams` builder idiom: write the query inline (`href={queryHref(base, { … })}`) rather than a multi-statement helper.

Notes / scope:
- go-template SSR lowering only in this cut; Mojolicious / Xslate parity (their query helpers) is a follow-up. They keep the generic lowering until then.
- Helper wrappers whose params-object references the helper's params aren't inlined yet (a pre-existing inliner limitation, since object literals lower opaquely from source) — the direct call is the supported idiom.
