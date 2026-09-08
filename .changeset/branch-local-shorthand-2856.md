---
"@barefootjs/jsx": patch
---

Fix #2856: `replaceBranchLocalRefs` (the #1425 branch-local-in-attr/reactive-expression substitution machinery in `jsx-to-ir.ts`) used a regex-based text scanner (`replaceInExprContexts`) with no notion of AST position. Substituting a branch-local referenced via object-literal shorthand (`{ local }`, simultaneously the key and the value) wrapped the substitution in parens and silently dropped the key, emitting invalid JS like `{ (_p.tag) }` — a syntax error that could break the whole client bundle's parse at hydrate time, with no compile-time diagnostic.

`replaceBranchLocalRefs` now tries a new AST-based, scope-aware `rewriteScopedValueRefs` (`prop-rewrite.ts`, generalized from the existing `applyScopedPropRefRewrite` used for destructured-prop rewriting) first, falling back to the legacy regex scanner only when the text doesn't parse as an expression or statement list. This also fixes an unrelated pre-existing gap for the same reason: a branch-local referenced inside a template-literal interpolation hole (`` `label:${local}` ``) used to be skipped entirely (the regex scanner treats a whole template literal as one opaque token) — it now resolves correctly there too.
