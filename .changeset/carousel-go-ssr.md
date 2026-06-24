---
"@barefootjs/go-template": patch
---

Render carousel (and similar) demos byte-identical to the Hono SSR reference (#1971).

Three Go-adapter SSR divergences that compiled clean but rendered wrong are fixed:

- **String-ternary memos mistyped as `bool`.** A memo like `() => orientation() === 'vertical' ? 'flex-col' : 'flex'` was classified boolean by the `===` in its condition and baked `class="false"`. Such string-literal/module-const-branch ternaries are now detected and resolved to a Go runtime conditional, including comparison conditions over a getter or an inline `props.X ?? 'default'`.
- **Optional object props always-truthy / dropped.** An optional named-struct prop (`opts?: EmblaOptionsType`) lowered to a value struct, so a `{{if .Opts}}`-guarded attribute could never be omitted and an inline `opts={{ … }}` was dropped. Optional named-struct props now lower to `map[string]interface{}` (nil/empty is falsy; keys round-trip through `bf_json` like `JSON.stringify`), and inline object literals bake to Go map literals.
- **Inline scalar-literal-array loops rendered zero items.** `[1,2,3,4,5].map(n => …{n}…)` had no datum plumbing for the scalar value. The loop wrapper now carries the value, the body define receives it, the literal slice is baked into the constructor, and `data-key` is stamped from the scalar.
