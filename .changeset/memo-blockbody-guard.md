---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
---

Carry a block-bodied memo's statements on the IR (`MemoInfo.parsedBlock`) so the
Go adapter can pattern-match block shapes without re-parsing `computation` with
`ts.createSourceFile`. The analyzer attaches them via a new
`parseBlockBodyTolerant` (best-effort: a statement the parser can't represent —
e.g. a trailing `return /* @client */ …` — is omitted rather than failing the
whole block, matching the adapter's former tolerant walk). The Go
`resolveBlockBodyMemoModuleConst` (the `const k = getter(); if (!k) return CONST`
guard memo, #1897) now reads `parsedBlock`. Additive and optional — other
adapters ignore the field, and `parseBlockBody` (strict) is unchanged.
Byte-identical, verified by go unit (556) + conformance (786). Removes the
`memo-value.ts` `ts.createSourceFile`.
