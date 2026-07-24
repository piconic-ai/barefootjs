---
"@barefootjs/jsx": patch
"@barefootjs/blade": patch
"@barefootjs/erb": patch
"@barefootjs/go-template": patch
"@barefootjs/jinja": patch
"@barefootjs/mojolicious": patch
"@barefootjs/rust": patch
"@barefootjs/twig": patch
"@barefootjs/xslate": patch
---

Fold `.map()` bodies with a leading `const`/`let` preamble, adapter-gated (callback-body fidelity, Stage 2 of `spec/callback-fidelity.md`).

A `.map()` callback body with a leading `const` before an if/else-if chain or `switch` (`{ const label = fmt(it); if (it.on) return <b/>; return <span/> }`) now folds into a nested `IRConditional` with the declarations emitted once per iteration, so the local is in scope in every branch. Because a DSL backend can't carry a loop-local into a conditional branch template, the fold is adapter-gated like the off-subset filter/sort predicates: a JS-runtime adapter (Hono, CSR) folds and runs it, while a DSL adapter refuses with `BF021` + the `/* @client */` escape rather than rendering the local `undefined` (a silent divergence). Covered by the `map-preamble-branch-body` conformance fixture (JS-runtime faithful, pinned BF021 on every DSL adapter) and the `map-multi-return-body` compiler-unit test (fold / refuse / `@client`-escape). A branch-local `const` (inside a branch block or case) and statement-level imperative nested loops remain unfolded — the latter is Stage 3's verbatim-JS territory.
