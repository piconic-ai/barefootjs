---
"@barefootjs/go-template": patch
---

Lower object / struct-array signal initial values from the carried IR tree too
(Roadmap A-4). `parsedLiteralToGo` now bakes an object literal against a
concrete local struct — mirroring `tsLiteralToGo`'s object branch (Go field
names resolved from the struct's field map, deferring on an unknown struct, an
undeclared key, or a nested object/array value). Combined with A-3's scalar
support, every fully-literal signal-array init (`createSignal<Item[]>([{ id:
"a" }])`, untyped synthesised-struct arrays, scalar arrays) now bakes from the
structured tree instead of re-parsing the value string with
`ts.createSourceFile`, which stays the fallback only for shapes the tree can't
represent (`as const`, calls, identifiers). Byte-identical — verified by the Go
adapter struct/scalar bake unit tests + conformance suite.
