---
"@barefootjs/go-template": patch
---

Internal refactor (#3425): the Go adapter's member access, higher-order callback method and array/string method lowering moved to `expr/member-and-methods.ts`. The generated Go templates are unchanged.
