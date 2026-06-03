---
"@barefootjs/jsx": patch
---

Fix silent missing hydration for a nested `.map()` of child components inside a **component-rooted** loop item (#1725). When a `.map()`'s item root was itself a child component (a passthrough wrapper like `SelectGroup`) whose JSX `children` contained a nested `.map()` of components (e.g. `SelectItem`), the parent init emitted `initChild()` only for the outer wrapper — never descending into its children to initialize the inner-loop component instances. They rendered from SSR but never hydrated (no error, just inert event handlers).

The compiler now collects inner loops inside a child-component loop item and emits a document-order zip (`qsaChildScopes` + per-component cursor over the flattened `outer.forEach(o => inner.forEach(i => ...))` iteration). This addresses the inner components by their slot selector rather than element offsets, so it works whether the wrapper component's root is an element (`<div>{children}</div>`) or a fragment (`<>{children}</>`) — the latter emits no per-group wrapper element to index.
