---
"@barefootjs/go-template": patch
---

Remove the `ts.createSourceFile` (`parseLiteralExpression` + `tsLiteralToGo`)
fallback from `jsLiteralToGo` in the Go adapter's value lowering (terminal
sweep, #2006). Signal/const inline initial values now bake exclusively from the
analyzer's carried structured `ParsedExpr` tree via `parsedLiteralToGo`, which
already reproduces every bakeable shape (scalars, a unary-minus number, scalar
arrays, and objects against a local struct) and keeps `nil` for everything else
(empty arrays, objects with no known struct, identifiers/calls, nested
object/array values, `as const`). The deleted fallback covered the same
bakeable shapes — every shape the analyzer leaves `unsupported` (so no tree is
carried) is also one the fallback's own `ts.is*` checks declined — so the
removal is byte-identical (verified by the 786/556 adapter gauntlet). The
inline primitive-literal loop-array bake now threads the loop's carried
`ParsedExpr` through the same structured path. The now-dead `tsLiteralToGo`
helper and its `typescript`/`typeInfoToGo` imports are deleted.
