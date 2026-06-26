---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
---

Add an `object-literal` kind to `ParsedExpr` (Roadmap A-1). The expression
parser now structures plain object literals (`{ a: 1, b: x }` / shorthand
`{ a }`) into `{ kind: 'object-literal', properties, raw }` instead of falling
through to `unsupported`; spread, computed-key, method, and getter/setter
literals still fall through unchanged. A matching `objectLiteral` method was
added to the shared `ParsedExprEmitter` dispatcher, so every adapter
(`go-template`, `mojolicious`, `xslate`) handles the new kind explicitly — the
same drift defence used for `array-literal` / `array-method`.

This is the foundational, byte-identical step that unblocks carrying signal
and local-`const` object/array values structurally on the IR (so the Go
adapter can drop its remaining `ts.createSourceFile` / value-regex lowering).
Adapters currently emit the new kind exactly as they emitted an object literal
before — through their `unsupported` path — and the IR-carry gates still treat
it like `unsupported`, so no emitted output changes.
