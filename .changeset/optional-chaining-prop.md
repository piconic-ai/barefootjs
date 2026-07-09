---
"@barefootjs/jsx": patch
"@barefootjs/jinja": patch
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
"@barefootjs/twig": patch
"@barefootjs/blade": patch
"@barefootjs/rust": patch
"@barefootjs/erb": patch
"@barefootjs/go-template": patch
---

Fix `user?.name ?? '…'` (optional chaining into an object-shaped prop) failing at render time on the Go and Ruby ERB adapters.

The shared `ParsedExpr` `member` variant gains an `optional: boolean` field, set from the source `?.` token (`ts.isPropertyAccessExpression`/`ts.isElementAccessExpression`'s `questionDotToken`) and threaded through every rewrite/copy site so it survives destructure and callback-body rewrites. `ParsedExprEmitter.member()` now receives this flag; six of the eight adapters (Jinja, Twig, minijinja, Text::Xslate, Blade, Mojolicious) ignore it outright because their existing member-access lowering is already null-safe by construction — Jinja/Twig/minijinja/Xslate's `[]`/`.` accessor swallows a `None`/`undef` receiver, and Blade already routes every access through the null-safe `data_get()` helper.

Go and ERB act on the flag:
- **Go**: an `optional` access routes through the runtime's existing nil-safe reflection getter (`bf_get`/`getFieldValue`, `bf.go`) instead of a literal `.Field` dot-chain, which panics evaluating a field on a nil interface/pointer (`nil pointer evaluating interface {}.Name`).
- **ERB**: an `optional` access emits Ruby's native safe-navigation form (`obj&.[](:key)`) instead of plain `obj[:key]`, which raises `NoMethodError` on a `nil` receiver.

Both routes only guard the single hop actually written with `?.` — a following plain `.c` after an optional `a?.b` is not (yet) short-circuited, so this does not yet match JS's whole-chain short-circuit semantics; see the `member` variant's docstring.

`optional-chaining-prop` graduates from a render divergence to a passing render on both adapters.
