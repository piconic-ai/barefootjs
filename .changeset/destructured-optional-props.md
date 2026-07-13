---
"@barefootjs/jsx": minor
"@barefootjs/go-template": minor
"@barefootjs/erb": patch
"@barefootjs/jinja": patch
"@barefootjs/mojolicious": patch
"@barefootjs/rust": patch
"@barefootjs/twig": patch
"@barefootjs/blade": patch
"@barefootjs/xslate": patch
---

Destructured optional props keep their TypeInfo and optional flag (#2259). `{ size }: { size?: number }` now resolves in `propsParams` exactly like the props-object style: primitive members carry their concrete type, every member carries `optional` derived from the type's `?` (or a destructure default), and generated export signatures render the `?` again. The client JS no longer synthesizes a zero default when extracting a defaultless optional prop — the binding stays `undefined` when absent, matching JS destructuring semantics and the SSR seed.

The Go adapter additionally recognises the destructured `x ?? <literal>` signal seed (matched structurally on the signal's `ParsedExpr`), so the #2248/#2252 hoisted-fallback/nillable machinery now fires for destructured components instead of seeding the signal with a literal zero, and an optional no-default scalar consumed as a bare omittable attribute (`rows={rows}`) takes the same `interface{}` flip so the `{{if ne .X nil}}` omission guard keeps firing now that the field would otherwise resolve concrete.

The dynamic-template adapters (ERB / Jinja / Mojolicious / Rust / Twig / Blade / Xslate) widen `collectNullableOptionalProps` to declared-optional primitives, keeping Hono-style attribute omission for optional props that previously arrived untyped — this also extends the omission guard to props-object-style optional primitives, matching the reference render.

Known output change on Go: a destructured optional scalar consumed as a bare TEXT expression now renders its zero value when absent (the pre-existing props-object behavior) instead of empty — tracked as #2267.
