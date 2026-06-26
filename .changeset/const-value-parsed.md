---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
---

Carry a module-scope constant's parsed value on the IR (`ConstantInfo.parsed`,
Roadmap A-2). The analyzer structures each module const's value once — parsed
from the parenthesised form so a bare object literal resolves to an
`object-literal` rather than being read as a block. The Go adapter's
static-record index lookup (`resolveStaticRecordLiteralIndex`, e.g. an icon
registry's `strokePaths['chevron-down']`) now reads the carried `object-literal`
structure for the common string/number value case instead of re-parsing the
const's value string, keeping `ts.createSourceFile` only as the fallback for
records the parser doesn't structure (spread / computed-key / template-key).
Byte-identical — verified by the Go adapter unit + conformance suites.
