---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
---

Read carried `ParsedExpr` trees in two more Go-adapter lowerings instead of
re-parsing source strings with `ts.createSourceFile` (Roadmap A terminal
sweep). Object-literal child-prop maps — an inline object passed to a child's
optional object prop (`<Carousel opts={{ align: 'start' }}>` →
`map[string]interface{}`) — now lower from the `ExpressionAttr.parsed`
`object-literal` tree via `objectLiteralToGoMap`. Scalar-literal loop typing —
`[1,2,3,4,5].map(...)` style loops whose `BfLoopItem` field types as
`interface{}` — now read a new `IRLoop.arrayParsed` (attached in `jsx-to-ir.ts`
as the parse of the same `array` string the adapter consumes, threaded through
`NestedComponentInfo.loopArrayParsed`) instead of re-parsing the loop's array
string in `scalarLiteralLoopGoType`. Both reproduce the previous output
byte-for-byte (string via `JSON.stringify`, numbers via the carried `raw`
token, unary-minus numbers preserved) and fall back / defer identically when
the tree is absent or unsupported — verified by the adapter conformance and Go
adapter suites (786 / 556).
