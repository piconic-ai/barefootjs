---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
---

Fix #2992: Go-template's cross-file type resolution no longer depends on file discovery/compile order. `GoTemplateAdapter.buildLocalTypeTables` previously populated its cross-file type registry only as a side effect of compiling the type's defining file, so a consumer resolved a borrowed type only when the definer had already compiled first — but `@barefootjs/vite`'s discovery pipeline sorts files alphabetically, not by import graph, so an unfavorably-named consumer (e.g. `App.tsx` importing from `Zebra.tsx`) silently fell back to `interface{}`/`nil`. A new `ensureCrossFileTypes` pre-pass resolves a not-yet-registered relative import by reading and analyzing the definer file directly (`resolveRelativeImportToFile`, newly exported from `@barefootjs/jsx`) before a consumer's own resolution runs, so resolution now depends only on the import existing on disk.
