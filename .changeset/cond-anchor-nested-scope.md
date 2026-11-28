---
"@barefootjs/client": patch
---

`insert()` no longer writes a conditional's branch into a nested child component when the child has a conditional with the same slot id. Slot ids are counted per component, so a loop row's conditional and a child rendered in that row can share one; the lookups for the conditional's `bf-c` element and its `<!--bf-cond-start-->` marker walked into the child's subtree and used the child's marker or element, on the first run and on later branch swaps (the row's content showed up a second time inside the child). Both lookups (`findCondTarget` and the new `findCondStart` in `query.ts`, used by `insert()` and `findCondContainer()`) now share one walk that never enters a nested scope: an element carrying `bf-s` other than the scope's own, or a fragment-root child's `<!--bf-scope-->` range. A child component's root can still be the conditional's element, and a parent-owned (`^`-prefixed) conditional rendered inside a child's `children` is still found.
