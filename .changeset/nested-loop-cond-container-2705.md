---
"@barefootjs/client": patch
"@barefootjs/jsx": patch
---

Fix #2705: a keyed inner `.map()` living inside a loop-row `&&`-conditional whose branch content sits behind an intervening wrapper element (e.g. `<article>{cond && items.map(...)}</article>`) used to search for its own loop markers against the WHOLE conditional's bind scope instead of the wrapper — `collectInnerLoops` never assigns the loop a `containerSlotId` in this shape, because the wrapper sits outside the branch's own IR subtree and the collector's slot-tracking walk never observes it. `mapArray`'s marker lookup only scans a container's direct children, so it silently misdetected the wrapper itself as the first item (stamping the wrong `data-key`) and appended any further items as siblings OUTSIDE the wrapper. Reproduced on the very first hydration pass.

`buildBranchInnerLoopsPlan` now falls back to a new runtime helper, `findCondContainer(scopeVar, condSlotId)` (`@barefootjs/client/runtime`), which resolves the conditional's own `<!--bf-cond-start:id-->` marker and returns its parent element — the one DOM anchor guaranteed to sit inside the real wrapper regardless of adoption vs. fresh-splice.
