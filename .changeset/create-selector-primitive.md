---
"@barefootjs/client": patch
"@barefootjs/jsx": patch
"@barefootjs/hono": patch
---

Perf: new `createSelector(source, fn?)` primitive (SolidJS-compatible, #2143 gap 5) — an O(changed) selection accessor for `class={isSelected(row.id) ? ... : ...}` patterns. Each row's effect subscribes to its own key instead of the raw signal, so a selection change re-runs two effects (deselected + selected row) regardless of list size. The returned accessor is `Reactive<>`-branded, so the existing type-based reactivity analysis recognises `isSelected(row.id)` with no analyzer changes beyond registering the export and a `needsTypeBasedDetection` trigger for bare selector usage outside `.map()`. `@barefootjs/hono` gains the matching SSR client-shim stub.
