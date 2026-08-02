---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
---

Resolve a one-hop const of a `Record[key]` lookup to the shared `lookup` template part, and collapse literal unions to their backing primitive in the Go adapter (#2477)

`const cls = variantClasses[variant]` followed by `className={cls}` fell through to a bare-expression attr. JSX-runtime SSR (Hono) evaluates the const fine, but every template backend emitted a reference to a variable the template never defines, rendering `class=""` with zero diagnostics — the inline form (`className={variantClasses[variant]}`, #2300) and the template-literal hop (`const cls = \`${variantClasses[variant]}\``) both already lowered correctly. The shared `Icon` component's `d={path}` had the same shape, so SVG icons server-rendered blank on every non-Hono backend until hydration.

Separately, an explicit literal-union type argument (`createSignal<'a' | 'b'>('a')`) had no `union` arm in the Go adapter's type or value lowering, so the field fell to `interface{}` and the seed to `nil` — failing `go run` outright when a child's `string` field received it. Literal unions now collapse to their backing primitive at both entry points, which must agree.
