---
"@barefootjs/jsx": patch
"@barefootjs/client": patch
---

Keep loop-row elements that a `ref` callback portals out of their row working after hydration (#3318). An element in a keyed top-level `.map()` row whose `ref` callback portals it with `createPortal(el, …, { ownerScope })` is now rendered at the portal outlet by SSR, carrying its row key, also when the callback is declared in the component body. Hydration pairs it with its row, the row's bindings reach it, the loop's delegated listeners fire for it, and it is removed with its row. This covers top-level, static-array, branch-scoped and composite loops. A row that cannot be paired is refused with the new BF064 error: an unkeyed row, a nested loop's row, or an element passed as a child component's children.
