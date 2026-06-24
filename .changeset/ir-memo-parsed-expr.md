---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
---

Carry parsed memo structure in the IR so adapters emit from it instead of re-parsing. Output byte-identical (adapter unit + conformance suites); no behavioural change. The only public-API change is additive and non-breaking: `MemoInfo` is now exported and gains an optional `parsed` field.

- `@barefootjs/jsx`: the analyzer now attaches `MemoInfo.parsed` — a structured `ParsedExpr` of the memo arrow's body (expression-bodied arrows only) — so adapters can shape-match a memo on the tree instead of re-parsing `computation`. `MemoInfo` is now exported.
- `@barefootjs/go-template`: replace the nine `computation.match(/…/)` regex shape-matches in `computeMemoInitialValueOrNull` with structural matching over `MemoInfo.parsed` (`getter() === 'lit'`, `props.X ?? false`, `cond() ? A : B`, `<ref> * N`, bare `getter()` / `props.X` / `var`). Block-bodied / unparsable memos fall back to the existing comparison-ternary / block-body / object-memo handling.
