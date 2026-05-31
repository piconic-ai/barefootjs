---
"@barefootjs/mojolicious": patch
---

Rewrite the Mojolicious adapter's expression lowering to be parse-first, matching the Go adapter.

`convertExpressionToPerl` now parses every expression once, gates it on the shared `isSupported`, and renders supported shapes through the AST emitter (`renderParsedExprToPerl`) — the same flow as the Go adapter's `convertExpressionToGo`. The per-method routing regexes, the regex string-rewriting pipeline, `convertHigherOrderExpr`, and `rewriteTemplatePrimitives` are all removed (net −229 lines). The parser's `UNSUPPORTED_METHODS` is now the single source of truth for what is refused, so no adapter-side method-name list has to be kept in sync.

The AST emitter (`MojoTopLevelEmitter`) gains the handling the regex pipeline previously did: `props.x → $x` flattening, identifier-path templatePrimitive calls (`JSON.stringify` / `Math.floor` → `bf->json` / `bf->floor`), top-level template literals, and a BF101 refusal for the still-unsupported `.find` / `.findIndex` / `.findLast` / `.findLastIndex` Mojo gap. No behaviour change: the full Mojo unit suite and the perl-rendering conformance suite pass unchanged.
