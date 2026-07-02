---
"@barefootjs/go-template": patch
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
---

Surface BF101 for a filter predicate whose body contains a nested higher-order callback the adapter can only degrade (#2038). The runtime evaluator refuses nested arrows, and the legacy predicate fallbacks silently rewrote such predicates — Xslate's Kolon-lambda emit collapsed the inner call to its receiver (`!other.some(r => …)` → `!other`), Mojo degraded nested `find*` / sort / reduce / flatMap the same way, and the Go filter-expr `call` arm dropped the arrow argument entirely. Each adapter is now loud at its exact degrade points, with `/* @client */` as the escape hatch. Faithful nested lowerings are untouched: Mojo's inline `grep` for nested `filter` / `every` / `some` and Go's `len (bf_filter_eval …)` for `.filter(cb).length` still render (pinned by the new `filter-nested-callback-predicate` conformance fixture).
