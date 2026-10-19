---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
---

`TypeDefinition.stringLiteralUnion` records the members of a string-literal union alias. The Go adapter reads it instead of matching the definition text, so an exported alias, a multi-line union with a leading `|`, and a double-quoted union now become a Go `string` alias instead of `interface{}`, and a union mixing in a non-string member (`'auto' | number`) is no longer typed `string`.
