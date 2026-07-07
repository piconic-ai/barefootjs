---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
"@barefootjs/erb": patch
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
"@barefootjs/twig": patch
"@barefootjs/jinja": patch
"@barefootjs/blade": patch
"@barefootjs/rust": patch
---

Fold the JSX render-nothing literals in Phase 1: `{null}`, `{undefined}`, `{true}`, and `{false}` in child position now produce NO IR node, matching JSX semantics (`{0}` still renders "0"). Previously the literal fell through to the scalar-expression fallback and each backend stringified it its own way — the Hono reference rendered the text "null" for `{null}` while template adapters rendered "false" for `{false}` (the `falsy-text-values` divergence from the Priority-12 sweep). With the fold living in the IR producer, every adapter — including CSR client JS — agrees by construction; the fixture graduates from every adapter's `renderDivergences` declaration and the CSR skip list.
