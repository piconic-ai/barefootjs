---
"@barefootjs/go-template": patch
---

Internal refactor of the Go template adapter: the collection of static child-component instances (the `.<Name>SlotN` fields and constructor inits on a parent's Props struct, and the instances a loop-body component's wrapper struct carries) moves out of `go-template-adapter.ts` into `children/static-children.ts`. Generated templates and Go are unchanged for every fixture and component.
