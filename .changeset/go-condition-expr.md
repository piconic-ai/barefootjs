---
"@barefootjs/go-template": patch
---

Internal refactor of the Go template adapter: the lowering of `{{if}}` conditions and of `.filter()` / `.find()` predicate bodies to Go-template pipelines moves out of `go-template-adapter.ts` into `expr/condition-expr.ts`. Generated templates and Go are unchanged for every fixture and component.
