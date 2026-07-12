---
"@barefootjs/jsx": patch
---

Fix #2222: fixes two bugs in the generated `hydrate(...)` `template:` lambda (a module-scope arrow, not a closure over `init`'s destructured locals).

1. A `.map()` loop whose array source is a destructured prop threw `ReferenceError: <name> is not defined` in the CSR template — both the plain-`.map()` fallback and the simple-`filter().map()` path built `IRLoop.templateArray` from a bare `array =` assignment instead of going through `setArray`, so the `_p.`-rewritten form the chained paths already produce never made it into the template lambda.

2. Inside a loop callback body, prop/const substitution was scope-blind: an outer destructured prop or an inlinable const's literal could get substituted at an occurrence that is actually the loop's own shadowing parameter (`values.map((label) => <li key={label}>{1 + label}</li>)` where `label` also names an outer prop or const). Fixed in three places, each scope-accurate rather than a coarse whole-component exclusion:
   - `rewriteBarePropRefs` now filters prop names out of `ctx.loopParams` (the transform position's live loop-param set, including destructured binding names and the index param) before rewriting bare identifiers to `_p.<name>`.
   - `generateCsrTemplateWithOpts`'s `loop` case now accumulates `loopBoundNames` per nesting level and filters them out of the child recursion's `csrEnv`, so an inlinable const / signal / memo never substitutes at a loop-shadowed occurrence.
   - `tryResolveIdentifierAsTemplateLiteral` (the IR-level const-literal fold used for e.g. `key={label}`) now guards on `ctx.loopParams`, so a loop-shadowed identifier is never baked to the outer const's literal — this fold runs at IR build time, so the fix applies to every adapter, not just CSR.

Adds the cross-adapter conformance fixture `loop-param-shadows-outer-name` (`packages/adapter-tests/fixtures/`), which #2212/#2222 previously could not add because CSR threw on this shape before either fix landed. It passes on every adapter except Go, which has its own, unrelated shadowing bug in `convertExpressionToGo`'s `+`-operator type resolution (tracked as #2236 and declared as a `renderDivergences` skip, not fixed here).

Scope note: this is the loop-shadow slice of #2235 (whole-component const-shadowing on SSR adapters is #2221, already fixed) and does not touch #2236 (Go operator-type shadowing) or #2237 (record-literal shadowing), both still open.
