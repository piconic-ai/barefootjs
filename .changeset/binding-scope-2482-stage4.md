---
'@barefootjs/go-template': patch
'@barefootjs/jsx': patch
---

#2482 Stage 4 (final): drive the binding-scope ratchet allowlist to its documented floor.

Go adapter: `renderLoop`'s loop-array const lookup gains a `!this.scope.isBound(arrayName)` guard — an enclosing loop's own item param shadowing a same-named module const could previously misfire a false BF101 diagnostic. Narrow, real correctness fix.

`@barefootjs/jsx`: internal only — `bf debug graph`'s `collectDomBindings` migrates its private loop-param Set onto `BindingScope` (18 occurrences, zero output change), and the internal `BindingEnvironment.loopParams` field (not part of the public surface) is renamed to `loopValueBoundNames` to say what it has actually carried since Stage 1a. Every remaining ratchet allowlist entry now carries a written FLOOR justification (no-live-scope prepasses, unrelated-domain `.find(` matches, accessor-payload structures), and the convention is documented in `spec/compiler.md` and `CLAUDE.md`.
