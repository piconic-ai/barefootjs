---
"@barefootjs/client": patch
---

Reactive attributes inside a conditional branch that is a direct child of a Fragment root keep updating after a CSR mount and after hydration (#3867). A Fragment root's scope is its comment range, and the branch lands as a sibling of the element standing in for that range, but `qsa()` searched only that element's own subtree, so `disabled` / `hidden` / `class` / `data-*` bindings in the branch were never wired. `qsa()` now also searches the other top-level elements of a comment scope's range (skipping nested child scopes), which also fixes the same bindings in a `.map()` row that is itself a conditional. `insert()` now resolves a comment scope's own id as the parent of a child component rendered in a branch, so the child keeps its server-rendered scope id on hydration and receives its props.

`render()` keeps a Fragment root's `<!--bf-scope:-->` comment range when the fragment renders a single element at mount. It used to treat that as a single-element root and drop the fragment's other top-level nodes, so a conditional branch absent at mount lost its markers and could never be entered.
