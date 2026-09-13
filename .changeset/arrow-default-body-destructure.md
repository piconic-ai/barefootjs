---
"@barefootjs/jsx": patch
---

Fixes #2940: a body-destructured prop's arrow-function default (`const { fmt = (v) => 'v' + v } = props`) now compiles to valid JS instead of a genuine `SyntaxError`.

`collectConstant`'s body-destructure branch (`analyzer.ts`) built the local's `value` as a bare `props.fmt ?? (v) => 'v' + v` — `??`'s right operand may not be a bare arrow function without parens. This string was spliced verbatim into the client-JS init body and the Hono SSR component alike, so both were broken, and two downstream passes (`rewriteDestructuredPropReads`, `pruneUnusedPropExtractions`) silently skipped themselves because the generated code no longer parsed.

The fix routes the analyzer's `value`-building through the same `??`-operand-parenthesizing decision `propReadFallback` already applied to every other live prop read (`props-binding.ts`'s new `coalesceDefaultText`), so an arrow/function-expression default is wrapped in parens everywhere it's spliced after `??`, matching what the parameter-destructured sibling form already did.
