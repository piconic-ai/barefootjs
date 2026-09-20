---
"@barefootjs/client": minor
"@barefootjs/jsx": patch
"@barefootjs/hono": patch
---

Removed `createSelector` (Alpha) from `@barefootjs/client`. It was SolidJS-compatible O(changed) selection primitive with zero authored call sites in `ui/`, `site/` or `integrations/`, and no conformance fixture exercised it. If you called it directly, replace it with a per-key `createMemo`: `const memos = new Map(); const isSelected = (key) => (memos.get(key) ?? memos.set(key, createMemo(() => selected() === key)).get(key))()`, or for a small/fixed key set just compare the signal inline (`selected() === row.id`).

`@barefootjs/jsx`'s analyzer no longer recognises `createSelector` as a known runtime import or as a trigger for type-based reactivity detection.

`@barefootjs/hono`'s client shim no longer stubs `createSelector`.
