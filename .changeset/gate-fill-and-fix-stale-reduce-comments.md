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

Close the latent `.fill()` gap and correct stale `reduce` documentation (callback-body fidelity, Stage 1 of `spec/callback-fidelity.md`).

`Array.prototype.fill(value)` had no template lowering on any DSL adapter but was reported "supported" by `isSupported`, so the DSL adapters emitted a raw `.fill(...)` method call with no build diagnostic — a silent footgun that only surfaced as a crash at template-render time. `fill` is now in the `UNSUPPORTED_METHODS` gate, so a DSL build fails loudly with BF101 and points at the `/* @client */` escape; a JS-runtime adapter (Hono, CSR) still runs it verbatim, since those skip `isSupported`. Covered by the `fill-unsupported` conformance fixture (JS-runtime faithful / DSL-diagnostic, pinned BF101 on every DSL adapter).

Also corrects two stale comments in `expression-parser.ts` (the claim that `find`/`some`/`every`/… are "intercepted as `higher-order` IR", and that `reduce` folds into a structured `ReduceOp` before the gate — neither is true; both flow through the runtime evaluator as a generic `call`) and removes the dead, never-referenced `ReduceMethod` type from `parsed-expr-emitter.ts`.
