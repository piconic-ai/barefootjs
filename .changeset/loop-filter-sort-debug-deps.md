---
"@barefootjs/jsx": patch
---

`bf debug graph` / `bf debug trace` now list the signals and memos read inside a loop's `.filter()` predicate and `.sort()`/`.toSorted()` comparator as dependencies of the loop, not just the ones read in the array expression itself. Previously `items().filter(t => filter() === 'all' || !t.done).map(...)` compiled without `/* @client */` showed `filter` with no consumers in the debug graph, because `IRLoop.filterPredicate` is lifted off the chain and kept separate from `IRLoop.array` during IR construction — the debug graph only scanned `array`. The runtime was never affected; this only fixes the debug tooling's reported dependency graph.
