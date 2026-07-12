---
"@barefootjs/twig": patch
"@barefootjs/jinja": patch
"@barefootjs/blade": patch
"@barefootjs/xslate": patch
"@barefootjs/rust": patch
"@barefootjs/mojolicious": patch
---

Fix #2221: every Twig-family adapter's `_resolveLiteralConst` (Mojolicious: `resolveLiteralConst`) is a flat name lookup against `ir.metadata.localConstants` with no notion of AST scope — it inlined an outer same-file const's literal value even at an occurrence that is actually an enclosing `.map()`/`.filter()` loop callback's own (shadowing) parameter of the same name, so every iteration rendered the same hard-coded literal instead of the per-item value. Twig, Jinja, Blade, Xslate, and Rust (minijinja) are guarded with the same coarse `collectLoopBoundNames` exclusion #2212 already established for `collectStringValueNames`: a name any loop binds anywhere in the component never inlines, falling back to the bare identifier — coarse (a genuinely non-shadowed same-named const elsewhere in the component also stops inlining) but safe.

Mojolicious's own `resolveLiteralConst` / `resolveStaticRecordLiteral` were already immune — they consult a *live*, ref-counted `loopBoundNames` map that `renderLoop` populates/depopulates as it descends/ascends into each loop body (#1749), which is scope-precise rather than coarse, so no change was needed there. The actual gap found in that adapter was a sibling call site: `emitSpread`'s bare-identifier local-const resolution (`{...attrs}` forwarding a function-scope conditional-object const's hashref, #checkbox/icon) read `localConstants` directly with no loop-shadowing guard at all. Fixed with the same `loopBoundNames` guard as its neighboring call sites.

Not fixed here (reported, tracked separately): a `key={name}` (or any bare-identifier JSX attribute value) shadowed by an enclosing loop param of the same name is folded to the OUTER const's literal at IR-generation time (`tryResolveIdentifierAsTemplateLiteral` → `findLocalConst` in `packages/jsx/src/jsx-to-ir.ts`), before any adapter runs — this affects every adapter, including Hono's native JSX re-emission, and needs a shared-compiler fix rather than a per-adapter guard. The Go template adapter has its own independent instance of this issue's bug class in `convertExpressionToGo`'s bare-identifier fast path (`packages/adapter-go-template/src/adapter/go-template-adapter.ts`), which lacks the loop-shadowing guards its sibling `resolveModuleStringConst`/`resolveModuleNumericConst` already have. The Twig-family's `_resolveStaticRecordLiteral` / `lookupStaticRecordLiteral` (module-scope object-literal consts, e.g. `variantClasses.ghost`) have the identical unguarded flat-lookup hazard when the object name itself is loop-bound (confirmed reproducible on Twig). None of these are fixed in this patch.
