---
"@barefootjs/go-template": patch
---

Fix two loop-scope resolution bugs found by the #2482 audit. `renderConditionExpr` now checks `loopBindingStack` (innermost-first, before module-const inlining) so a destructured `.map()` param used as a row ternary condition resolves to the row-scoped field instead of a root-scope one (#2486). `inLoop` is now saved/restored around both loop-rendering paths instead of being unconditionally cleared, so a nested inner loop's exit no longer clobbers the outer loop's flag for its remaining tail content, e.g. a spread attribute after a nested loop no longer misroutes to the component-root slot mechanism (#2487).
