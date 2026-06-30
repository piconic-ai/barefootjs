---
"@barefootjs/jsx": minor
"@barefootjs/go-template": patch
---

Fold the searchParams object memo in the analyzer (value-only mode); the Go adapter reads the folded `parsed` directly (#2040, PR-D of the memo follow-up stack).

`foldBlockToExpr` gains a `valueOnly` option: for a memo's SSR initial value the `parsed` tree is consumed for its VALUE only — effects run on the client via the verbatim runtime code — so a possibly-impure `const` used on some paths but not others is safe to inline (the value on every path is unchanged; only an effect on a path that doesn't use the value is dropped). Duplication of a non-deterministic call (used more than once on a path) is still refused.

The analyzer's memo fold now (a) uses `valueOnly` and (b) adds the `searchParams()` env-signal local(s) to the purity oracle — an idempotent request-query read — so a `const sp = searchParams()` object memo folds to an `object-literal` `parsed` at analysis time. The Go adapter's `computeObjectMemoInitialValue` then reads that folded `parsed` directly and the per-adapter re-fold is removed; `searchParamsLocalNames` is reusable from `{ imports }` (one definition, shared by the analyzer and the adapters).

This drops `parsedBlock` from the object-memo path. Two justified consumers remain (the template-literal block memo and the guard-const fallback for blocks whose unfoldable *alternate* branch — irrelevant to the SSR value — prevents a whole-block fold), so `parsedBlock` stays in the IR for now. Render parity verified: Go adapter unit + conformance (Go + Perl) green, jsx suite carries only the pre-existing checker-alias failures.
