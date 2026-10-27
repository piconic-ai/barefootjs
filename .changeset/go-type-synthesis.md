---
"@barefootjs/go-template": patch
---

Internal refactor of the Go template adapter: the Go type-synthesis decisions (the struct inferred from an untyped object-literal array, the row type of a nested loop with no declared item type, and the per-compile local type tables seeded from a file's own and imported types) move out of `go-template-adapter.ts` into `type/type-synthesis.ts`. Generated templates and Go are unchanged for every fixture and component.
