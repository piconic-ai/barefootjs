---
"@barefootjs/go-template": patch
"@barefootjs/mojolicious": patch
---

Inline module-scope pure string-literal constants referenced in
expressions (e.g. `const labelClasses = '...'` used in a `className`
template literal) on the Go and Mojo template adapters. Previously such
an identifier lowered to an unpopulated struct-field / stash-variable
reference (`{{.LabelClasses}}` on Go — failing `can't evaluate field
LabelClasses`; `$labelClasses` on Mojo — rendering empty), because a
module const is neither a prop, signal, nor local and no field/var ever
bound it. The adapters now resolve the identifier through the IR's
`localConstants` and inline the literal value (escaped for the target
template language), matching what the Hono reference produces by
evaluating the real JS. Only module-scope pure string literals qualify —
`Record<T,string>` indexed lookups, memos, signals, and function-scope
locals are deliberately excluded — and inlining is suppressed for any name
shadowed by an enclosing loop binding (matching the Go adapter's
loop-shadowing guards). This unblocks cross-adapter conformance for the
`site/ui` `label` and `input` primitives.

The Mojolicious adapter now relies on `typescript` at runtime (to parse
const initializers), so it is externalized in the build and declared as a
peer dependency, consistent with `@barefootjs/go-template`.
