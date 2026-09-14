---
"@barefootjs/go-template": patch
---

No behavior change. Documents and pins a known ordering-dependency gap left by #2991's cross-file type registry fix (#2984): the registry only resolves a type once its DEFINING file has already compiled, but the real `@barefootjs/vite` pipeline discovers/compiles files in plain alphabetical order rather than import-graph order, so a consumer whose filename sorts before its type's definer (e.g. `App.tsx` importing a type from `Zebra.tsx`) still hits the original `interface{}`/`nil` fallback. Adds a docstring pointer at the cross-file resolution loop and a pinned regression fixture asserting the current (incomplete) output. Tracked as a `known-limitation` + `bug` in #2992.
