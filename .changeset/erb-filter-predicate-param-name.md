---
"@barefootjs/erb": patch
---

Fix #2245: a `filter().map()` loop whose filter and map callbacks name their params differently (e.g. `todos.filter(t => t.done).map(todo => ...)`, the exact `TodoAppSSR.tsx` shape) no longer raises `NoMethodError: undefined method '[]' for nil` at real Ruby render time. `ErbFilterEmitter` used to match a filter predicate's identifiers against the LOOP's (map callback's) param instead of the filter callback's OWN param, so a differently-named filter param lowered to an unseeded `v[:name]` vars-Hash read; it now matches against the filter's own param while still emitting the loop's actual bound Ruby local (`ErbFilterEmitter`'s new `renderParamAs`). Masked in the shipped corpus by `todo-app-ssr`'s `'all'`-default filter short-circuiting the buggy predicate branch away — pinned by the new `filter-param-name-differs` cross-adapter fixture and ERB adapter unit tests.
