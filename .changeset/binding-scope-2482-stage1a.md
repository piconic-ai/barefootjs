---
'@barefootjs/jsx': patch
---

Migrate the compiler's loop-callback scope tracking onto `BindingScope` (#2482 stage 1a) and bind `.map()` preamble locals into the scope, so a preamble-declared local shadowing a same-named module/component constant is no longer const-folded into every row. Adds `BindingScope.valueBoundNames()` for reactivity/slot classifiers.
