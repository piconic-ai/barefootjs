---
"@barefootjs/jsx": patch
"@barefootjs/hono": patch
---

Unify flatMap callbacks onto the structured-segments carrier — the `__BF_JSX_N__` sentinel ceases to exist.

`FlatMapCallback` was the last user of the sentinel-string mechanism (body text with `__BF_JSX_N__` placeholders, substitution duplicated per emitter). It now carries the same structure as `.map()` preambles — js-text / compiled-JSX-leaf segments rendered through the single `renderPreamble()` door, plus `TsxSourceText`-branded raw TSX for JSX-runtime SSR — so the placeholder concept (and its user-string collision hazard and per-emitter `String.replace` fragility) is gone from the compiler entirely. Riding the shared machinery brings three behavior fixes to flatMap block bodies: leaf text interpolations now escape like the SSR JSX runtime (`flatmap-escaping` fixture pins byte parity), TypeScript type annotations in the body are now stripped from the client bundle (previously spliced raw), and a JSX leaf inside a template literal is refused explicitly. Analysis walkers (`attachParsedExpressions`, loop-bound names, rich-type refusal) now also visit `.map()`-preamble leaf IR, closing an analysis-coverage gap. A test-gated `getJS` trust-boundary assertion (armed by the trichotomy harness) makes any future "raw JSX spliced into output on an error-free compile" throw at the source instead of leaking.
