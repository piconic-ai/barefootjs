---
"@barefootjs/go-template": patch
---

A memo that reads a prop raw (`createMemo(() => props.b)`, `createMemo(() => props.n * 2)`, `n / 2`, `n + 1`, `props.f ?? false`) beside a signal seeded by `props.b ?? 'y'` now reads the prop itself. Before, its SSR value read the signal's hoisted fallback local, so an omitted prop rendered the signal's fallback. Arithmetic over an omitted optional number prop in a memo now gives `NaN` as JS does (the same `bf.Number` coercion the template path applies), and the destructured form (`({ n }) => … createMemo(() => n * 2)`) no longer emits `in.N * 2` over an `interface{}` field, which did not compile.
