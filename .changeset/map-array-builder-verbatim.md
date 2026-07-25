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

Render arbitrary array-builder `.map()` bodies verbatim on JS-runtime adapters (callback-body fidelity, Stage 3 / D4 + D5 of `spec/callback-fidelity.md`).

A `.map()` callback that constructs JSX in a statement before its `return` — the imperative array-builder `{ const out = []; for (const c of r.cells) out.push(<td>{c}</td>); return <tr key={r.id}>{out}</tr> }` — previously refused on every backend (it would otherwise leak raw JSX into the plain-JS bundle). On a JS-runtime adapter it now renders verbatim: each JSX leaf lowers to a template-literal HTML string (reusing the flatMap-callback fragment mechanism), the imperative control flow runs as-is, and the `{out}` element-array child is joined into the row so SSR, hydration, and CSR all render identical markup. The loop key is hoisted (D5): it is derived from the raw item and evaluated before the body runs, so a key that reads a preamble-computed local is refused rather than compiled to an unbound `keyFn`. A leaf that carries an event handler, a component, a nested loop, a reactive expression, or a spread is refused loudly (no silent divergence). A DSL adapter refuses the whole shape with `BF021` + the `/* @client */` escape (which renders the loop client-only, where the browser runs the same verbatim body). Covered by the `map-array-builder-body` conformance fixture (JS-runtime faithful, pinned BF021 on every DSL adapter) and the rewritten `map-arbitrary-body` compiler-unit test (verbatim lowering, `{out}` join, keyFn hoist, key-derivability and leaf-scope refusals). Also fixes a latent bug where `TestAdapter.renderLoop` dropped the `.map()` preamble entirely.
