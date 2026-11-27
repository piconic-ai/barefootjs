---
"@barefootjs/jsx": patch
"@barefootjs/erb": patch
---

A component that reads its `children` through a body const holding a fallback (`const label = props.children ?? 'missing'`, `|| 'missing'`, `?? ''`, over a destructured `children` too, and through a further `const d = label`) and renders it as text (`{label}`) now prints the children as markup on ERB and in the client template, as Hono does, where both printed the markup as escaped text before. The fallback is still escaped text. Phase 1 sets `IRExpression.childrenRead` on such a read.
