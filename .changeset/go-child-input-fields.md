---
"@barefootjs/go-template": patch
---

Internal refactor of the Go template adapter: the lowering of a child component's props into its `New<Child>Props(<Child>Input{...})` literal (the `{...props}` spread plan, the per-kind value lowering, the loop-row refusal and the source-row fields of a bodyless prop-array loop) moves out of `go-template-adapter.ts` into `props/child-input-fields.ts`, and the constructor-time value helpers it uses move into `value/child-prop-value.ts`. Generated templates and Go are unchanged for every fixture and component.
