---
"@barefootjs/go-template": patch
---

Internal refactor of the Go template adapter: the emission of intrinsic-element attributes (the `style={{ … }}` object, boolean and presence attributes, ternary values including the `cond ? v : undefined` omission, template literals, registered `bf_attr` calls, the nil-guarded omission paths and `{...spread}` attributes) moves out of `go-template-adapter.ts` into `attr/element-attrs.ts`. Generated templates and Go are unchanged for every fixture and component.
