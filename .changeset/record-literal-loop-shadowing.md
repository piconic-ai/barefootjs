---
"@barefootjs/twig": patch
"@barefootjs/jinja": patch
"@barefootjs/blade": patch
"@barefootjs/xslate": patch
"@barefootjs/rust": patch
---

Fix #2237: every Twig-family adapter's `_resolveStaticRecordLiteral` (`IDENT.key` lookup on a module-scope object-literal const, e.g. `variantClasses.ghost` — #1896/#1897) is a flat name lookup on `objectName` against `ir.metadata.localConstants` with no notion of AST scope — the record-literal sibling of #2221's `_resolveLiteralConst` bug. It inlined an outer same-file const's member value even at an occurrence that is actually an enclosing `.map()`/`.filter()` loop callback's own (shadowing) parameter of the same name, so every iteration rendered the same hard-coded literal instead of the per-item value. Twig, Jinja, Blade, Xslate, and Rust (minijinja) are guarded with the same coarse `staticLoopSourceBoundNames` exclusion #2221 already established for `_resolveLiteralConst`: an object name any loop binds anywhere in the component never inlines its member lookups, falling back to the bare member expression — coarse (a genuinely non-shadowed same-named const elsewhere in the component also stops inlining) but safe.

Mojolicious's `resolveStaticRecordLiteral` was already immune — flagged as such in the #2221 sweep and confirmed here with a compile repro plus a regression pin (no code change needed): it consults the same *live*, ref-counted `loopBoundNames` map that `resolveLiteralConst` and `renderLoop` already use (#1749), which is scope-precise rather than coarse, so a name loop-bound only inside one loop still inlines its member lookup correctly outside it.
