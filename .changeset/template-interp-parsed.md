---
"@barefootjs/go-template": patch
---

Lower a template-literal memo's SSR value from the carried IR tree instead of
re-parsing `computation` with `ts.createSourceFile`.
`computeTemplateLiteralMemoInitialValue` now reads the template from `memo.parsed`
(expression body) or `memo.parsedBlock` (block body — the Toggle `classes` memo,
collecting its `const X = props.Y ?? 'lit'` key bindings), and its interpolation
resolvers (`resolveTemplateInterpolation` / `parseLocalKeyBinding` / the
record-index lowering) operate on `ParsedExpr`. The record-index case reads the
`recordConst`'s carried `ConstantInfo.parsed` object-literal rather than the
shared `parseRecordIndexAccess` (which the other adapters keep using unchanged).
Byte-identical — verified by go unit (556) + conformance (786), including the
carousel class memos and the Toggle `variantClasses[variant]` record index.
Removes the `template-interp.ts` `ts.createSourceFile`.
