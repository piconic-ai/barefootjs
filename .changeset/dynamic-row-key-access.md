---
"@barefootjs/go-template": patch
"@barefootjs/twig": patch
"@barefootjs/erb": patch
"@barefootjs/mojolicious": patch
---

Fix a dynamic-key element access on a loop row (`tone[k]`, #2491) that rendered empty on ERB/Go/Twig and threw a fatal `Not an ARRAY reference` on Mojolicious. All four adapters previously made a compile-time GUESS about whether the index was a string key or a numeric index — a guess the shared analyzer can't resolve for a destructured `.map()` param, since it types the binding `{kind:'unknown'}` — and each guess failed for a different reason (exact-case map lookup, symbol-vs-string key mismatch, wrong deref form). The fix routes every dynamic index access through a runtime-polymorphic accessor instead, mirroring the passing engines (Jinja/minijinja `[]`, Blade's `data_get()`, Xslate's native `[]`): Go's `indexAccess` now emits `bf_get`, and `getFieldValue` gained a slice/array/string branch so it's a strict superset of the `index` builtin; Twig's `indexAccess` emits the built-in `attribute()` function instead of `[]` (which is not polymorphic against a `stdClass` receiver, unlike `.`); ERB and Mojolicious each gained a new `get(collection, key)` runtime helper (`bf.get` / `bf->get`) that dispatches on the receiver's runtime type. The existing numeric-index case (`selected()[index]`, data-table) keeps working unchanged on every adapter.
