---
'@barefootjs/jsx': patch
'@barefootjs/twig': patch
'@barefootjs/jinja': patch
'@barefootjs/blade': patch
'@barefootjs/xslate': patch
'@barefootjs/rust': patch
'@barefootjs/erb': patch
'@barefootjs/mojolicious': patch
---

Migrate the seven template-string adapters (Twig, Jinja, Blade, Xslate, Rust/minijinja, ERB, Mojolicious) onto `BindingScope` for loop-callback shadow guards (#2482 stage 2). Each adapter's ad-hoc device pair — a coarse whole-component shadow-name `Set` plus a ref-counted, position-accurate `Map<string, number>` (or, for ERB/Mojolicious, a single already-live map) — collapses into one threaded, immutable `this.scope: BindingScope`, entered/exited by reference around `renderLoop`'s body exactly like the Stage 1a/1b `ctx.scope` precedent in `jsx-to-ir.ts`. `IRLoop` already structurally satisfies `LoopBindingSource`, so `renderLoop` passes the loop node straight to `enterLoopRow`.

This ends a real coarse/live drift: `resolveStaticLoopSource`'s `isNameShadowed` callback previously received the coarse whole-component set from five adapters (twig/jinja/blade/xslate/rust) but the live, position-accurate map from ERB/Mojolicious — same shared function, two different meanings depending on caller. All seven adapters now feed the same canonical, position-accurate predicate (`scope.asShadowPredicate()`). The five Twig-family adapters' `_resolveLiteralConst`/`_resolveStaticRecordLiteral` module-const-inlining guards are also canonicalized from a coarse whole-component exclusion to the position-accurate scope, matching ERB/Mojolicious's existing (already-correct) behavior: a same-named const outside any shadowing loop now inlines even when a same-named loop param exists elsewhere in the component — previously an accepted-but-imprecise trade-off, now fixed.

`@barefootjs/jsx`: `lookupStaticRecordLiteral` (`augment-inherited-props.ts`) gains a required `isShadowed` guard parameter instead of leaving the shadow check to caller discipline — every one of the seven call sites now passes its threaded scope's `isBound` predicate.
