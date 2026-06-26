---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
---

Carry a signal's parsed initial value on the IR (`SignalInfo.parsed`, Roadmap
A-3) and lower literal signal inits from it. The analyzer structures each
signal's `initialValue` once (best-effort, from the same type-stripped string
the adapter consumes). A new `ParsedExpr.literal.raw` field carries the numeric
literal's `ts.NumericLiteral.text` (TS's normalised token) so a structured
lowering matches the existing `ts.createSourceFile` path byte-for-byte instead
of the lossy `parseFloat` value. The Go adapter's scalar-array signal bake
(`convertInitialValue` → `jsLiteralToGo`) now reads the carried tree via a new
`parsedLiteralToGo` helper, which reproduces the scalar / scalar-array shapes
exactly and defers (returns null) everything else — object/struct-array baking,
empty arrays, `as const` — to the unchanged `ts.createSourceFile` fallback. So
only the reproduced shapes skip the re-parse; behaviour is byte-identical,
verified by the Go adapter unit + conformance suites.
