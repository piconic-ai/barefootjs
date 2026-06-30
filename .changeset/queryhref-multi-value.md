---
"@barefootjs/client": minor
"@barefootjs/go-template": minor
"@barefootjs/perl": minor
---

`queryHref` now accepts an **array value** for multi-value query keys (#2048, the Q4 follow-up to #2042): `queryHref(base, { tag: ['a', 'b'] })` → `?tag=a&tag=b`, i.e. `URLSearchParams.append` rather than `set`. Empty / falsy members are skipped (same truthy-omit as a scalar), so an empty — or all-empty — array contributes nothing. `QueryParamValue` becomes `string | string[] | null | undefined`.

This works across the client and all SSR adapters byte-for-byte:

- **`@barefootjs/client`**: `queryHref` appends each non-empty array member.
- **`@barefootjs/perl`** (Mojolicious + Xslate via the shared `query` helper): an array ref appends one pair per non-empty member.
- **`@barefootjs/go-template`**: `bf_query` appends each non-empty member of a `[]string` (or `[]any`) value. To support this, the value-emptiness check moved from the lowering into the `bf_query` helper itself — a plain `key: v` now lowers to a `(true)` include and a conditional to `(cond)`, and the helper drops an included-but-empty value. This matches the client and Perl exactly (it also removes the previous Go-only divergence where an explicitly-included empty value was kept as `k=`); rendered output for existing scalar usage is unchanged.

The `query` helper's array behaviour is conformance-tested across the Go and Perl backends via the shared golden helper vectors.
