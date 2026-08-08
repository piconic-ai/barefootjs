---
"@barefootjs/go-template": patch
"@barefootjs/jsx": patch
---

Go adapter: replace type-string/value-text regex parsing with structural typing (#2484)

Two migrations, both scoped to keep generated Go byte-identical:

- **Type resolution** (`tsTypeStringToGo`, `type-codegen.ts`): deleted the
  `t.endsWith('[]')` / `/^Array<(.+)>$/` regex branches. By the time a
  `TypeInfo` reaches `tsTypeStringToGo` (via `typeInfoToGo`'s `'interface'`
  case), `typeNodeToTypeInfo` has already normalised every array spelling
  (`T[]`, `Array<T>`, `ReadonlyArray<T>`) to `kind: 'array'` — the regex
  branches were dead code matching a shape that could never arrive. The
  function is now a plain local-struct/alias lookup. The same dead-code
  pattern was found and fixed in `resolveLoopDatumFields`
  (`go-template-adapter.ts`), which regexed a trailing `[]` off a loop
  item's `TypeInfo.raw` instead of reading `elementType` off an
  array-`kind` `TypeInfo`.

- **Value-literal classification** (`numberPrimitiveGoType`,
  `inferTypeFromValue` in `type-codegen.ts`; `convertInitialValue` in
  `value-lowering.ts`; `parsedLiteralToGo` in `parsed-literal-to-go.ts`):
  each now prefers a caller-supplied `preParsed?: ParsedExpr` — the SAME
  default/initial value already parsed to structure (`SignalInfo.parsed`,
  `ParamInfo.parsed`) — over regexing the value's source text
  (`/^-?\d+\.\d+$/`, `value === 'true'`, quote-swapping). `ParamInfo.parsed`
  is a new field (`packages/jsx/src/types.ts`), attached by the analyzer
  (`packages/jsx/src/analyzer.ts`) via `tsNodeToParsedExpr` on a destructured
  prop's own default-value AST node — mirroring the existing
  `SignalInfo.parsed` convention, no re-parsing of already-stringified text.
  `typeInfoToGo` grew a `preParsed` parameter threaded from every caller that
  has a structural counterpart for its `defaultValue`/`initialValue`
  (signal/prop struct-field typing, memo type inference, prop-type
  overrides, boolean-memo detection).

Text-based fallbacks remain ONLY where no structural counterpart exists yet
(a caller passing `preParsed: undefined` because `tsNodeToParsedExpr`
doesn't cover that value's shape) — each is commented as a fallback and
names the caller relationship (`typeInfoToGo`'s two callers-with-no-parsed
paths, `convertInitialValue`'s per-primitive text branches).

No behavior change: Go adapter conformance and adapter-tests suites pass
unchanged.
