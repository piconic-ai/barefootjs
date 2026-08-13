---
'@barefootjs/go-template': patch
---

Fixes a `Record<string, T>` prop compiling to an invalid Go slice field when its name pluralizes into a same-named `/* @client */` child-component loop (#2627, e.g. a `tags: Record<string, T>` prop alongside a `{/* @client */ entries.map(([id, t]) => <Tag .../>)}` loop, where `entries` is itself derived from `Object.entries(props.tags)`, not a direct prop reference).

Root cause: the Input/Props/NewProps struct generation treated ANY same-named child-component loop as "subsumed" by the prop and dropped the prop's own field in favor of a synthesized `Tags []TagInput` array field — correct when the loop ranges directly over the prop (`props.rows.map(...)`), but wrong here, where the loop's array is a client-only-deferred computed local with no Go-side value to seed that field from at all. The result was either a duplicate Go struct field (compile error) or the prop's own field silently disappearing, so the caller-supplied `map[string]any` value had no matching field to assign into.

Fix: the nested-array "shadow" now only applies when the loop is genuinely prop-derived, and a clientOnly loop whose array is neither a signal/memo nor a direct prop reference is excluded entirely from Input/Props/NewProps codegen — the SSR template never references it (`renderLoop`'s clientOnly branch emits only marker comments), so the client computes everything from the prop's own value, which now keeps its own field and type.

Graduates the `static-array-from-props-with-component-client` render divergence and the matching `unescapable` pin on `static-array-from-props-with-component` — the escape is now verified working on go-template like every other adapter.
