---
"@barefootjs/jsx": patch
---

A `'use client'` file where a component referenced a same-file sibling
whose body is a multi-return JSX dispatch (`switch` / `if`-`else` chain,
e.g. a `NavIcon` helper dispatched over an icon name) previously compiled
with zero diagnostics, but the sibling produced no template — the compiler
silently dropped it, and the emitted `renderChild`/`initChild`/
`createComponent` call threw `ReferenceError: <Name> is not defined` at
SSR/hydrate time (#2556).

Root cause: `listComponentFunctions`'s #932 "preserve verbatim helper"
bypass only applies to non-`'use client'` files. In a client file the
multi-return sibling is instead asked to compile as a standalone
component, and a top-level `switch` dispatch (unlike an `if`/`else`
chain, which #1401 folds into a conditional template) is preserved as a
verbatim init statement rather than yielding a template — so
`compileMultipleComponents`'s Pass-1 loop silently skips it while the
referencing sibling's IR still points at the dropped name.

New diagnostic **BF048** detects this structurally, from the IR
component-reference graph, and fails the compile instead of shipping the
silent `ReferenceError`. Non-`'use client'` files (where #932's verbatim
preservation applies) and siblings whose multi-return body does compile
(`if`/`else` chains, #1401) are unaffected.
