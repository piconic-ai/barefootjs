---
"@barefootjs/client": minor
"@barefootjs/jsx": minor
"@barefootjs/shared": patch
"@barefootjs/go-template": patch
"@barefootjs/hono": patch
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
---

Recognize the `searchParams` env signal structurally via `createSearchParams()` (#2057, part 1).

The request-scoped query env signal is now a `createSignal`-shaped factory the compiler recognizes by structure, removing the `searchParams` name allow-list from the compiler core:

```tsx
// before
import { searchParams } from '@barefootjs/client'
searchParams().get('sort')

// after
import { createSearchParams } from '@barefootjs/client'
const [searchParams, setSearchParams] = createSearchParams()
searchParams().get('sort')        // reactive read
setSearchParams({ sort: 'price' }) // single imperative navigation path
```

Because `searchParams` is now a real signal getter, it lands in the fold purity oracle and reactive-getter set structurally — the clean fix for the fold-oracle special-casing (superseding the reverted #2055) with no name allow-list.

- `@barefootjs/client`: **breaking** — the bare `searchParams` export is replaced by `createSearchParams()`, which returns a `[getter, setter]` tuple. The getter is the request-scoped query reader (unchanged SSR + client resolution); `setSearchParams(next)` is the single imperative navigation path (soft same-route nav via the router seam, hard-nav fallback otherwise), replacing the confusing mutable-`URLSearchParams` write path. `SearchParamsInit` accepts a query string, `URLSearchParams`, or a record.
- `@barefootjs/jsx`: `createSearchParams` is a recognized signal primitive tagged with an `envReader` key on `SignalInfo`; `CLIENT_EXPORTS` swaps `searchParams` for `createSearchParams`; env-signal recognition flows from IR structure, not import names. Codegen keeps env signals out of normal value/field emission while leaving them in the reactivity graph.
- `@barefootjs/shared`: new `BF_SEAM_NAV_SEARCH` seam for imperative query navigation.
- Adapters (`go-template`, `hono`, `mojolicious`, `xslate`): env-signal reader lowering keys off signal structure instead of the import name; the per-request reader binding (`bf.SearchParams` / `$searchParams`) is unchanged.

Migration: replace `import { searchParams } from '@barefootjs/client'` + `searchParams()` with `import { createSearchParams } from '@barefootjs/client'` + `const [searchParams] = createSearchParams()`, and use `setSearchParams(...)` for imperative query navigation.
