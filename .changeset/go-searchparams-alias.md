---
"@barefootjs/go-template": patch
---

Fix `searchParams()` SSR on the Go template adapter for an aliased import. `import { searchParams as sp }` + `sp().get(k)` now lowers to the canonical `.SearchParams.Get` field (and the `SearchParams bf.SearchParams` struct binding is generated), matching the non-aliased path — previously detection missed the alias (so no field was emitted) and the call lowered to a `.Sp` field that never exists. Detection now uses the shared `searchParamsLocalNames` helper (the same one the Mojo/Xslate adapters use), so the binding is found under any local name. #1922
