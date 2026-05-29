---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
"@barefootjs/mojolicious": patch
---

Widen `.sort()` / `.toSorted()` comparator lowering with multi-key, relational-ternary, and block-body shapes (#1448 Tier B follow-up).

The comparator parser now builds a structured `SortComparator` as a `keys: SortKey[]` list and accepts three previously-refused shapes (each lowering to both template-language adapters + the Hono/CSR JS path):

- **Multi-key (`||`-chain)** — `(a, b) => a.x - b.x || a.y.localeCompare(b.y)` splits into one comparison key per `||` operand, applied in priority order as tie-breaks. Emits one 4-string `bf_sort` group (Go) / one `keys` hash (Mojo) per key.
- **Relational ternary** — `(a, b) => a.f > b.f ? 1 : -1`, the 3-way `a.f < b.f ? -1 : a.f > b.f ? 1 : 0`, and the leading-tie `a.f === b.f ? 0 : …` forms lower to a new `auto` compare type: numeric when both keys parse as numbers, else lexical. Both template runtimes share this rule so their output stays byte-equal (diverges from JS `<`/`>` only for numeric strings).
- **Single-`return` block bodies** — `(a, b) => { return a.f - b.f }` (arrow form; the function-expression form already worked) unwrap to the returned comparator.

Runtime: Go `bf_sort` is now variadic over 4-string key groups with an `auto` branch; Mojo `bf->sort` takes an ordered `keys` list with the same `auto` rule. Function-reference comparators (`sort(myCmp)`), multi-statement block bodies, and `localeCompare(b, locale, opts)` stay refused (BF021) — deferred follow-ups.
