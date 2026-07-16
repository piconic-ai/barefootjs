---
"@barefootjs/jsx": patch
---

Add #2276: the change-time coupling rule (a subset extension merges only with
fixtures in the same PR) is now written into `CLAUDE.md`, and its
catalogue-half mechanical backstop lands for `array-method`. `@barefootjs/jsx`
exports `ARRAY_METHOD_NAMES` — the positive registry of catalogued
`array-method` names, exhaustiveness-pinned against the `array-method` union
(adding a method without listing it fails to compile, mirroring
`PARSED_EXPR_KINDS`). The coverage-ledger floor test then requires every
listed method to have a covering fixture (or a documented allowlist entry),
so a new catalogued array-method can't ship without conformance coverage.
