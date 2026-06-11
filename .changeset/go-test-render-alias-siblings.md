---
"@barefootjs/go-template": patch
---

`test-render` now recognises alias-import siblings (any specifier present in the `components` map, e.g. `@ui/components/ui/<name>`) when computing the reachable child set, and deduplicates module-scope shared types emitted once per component by multi-component child files. Previously an alias-imported child produced a combined unit referencing `New<Child>Props` without the child's type block (`undefined` compile errors), and multi-component child files failed with `redeclared in this block`.
