---
"@barefootjs/jsx": patch
---

Fix #2282: loop-child reactive text now falls back to the Solid-style AST-flag classification, matching the loop-child reactive attribute path (#1673) and the top-level text path. Previously, a loop-item text expression read through a helper the string-level `classifyReactivity` heuristic couldn't see through (e.g. `labelAt(i)` where `const labelAt = (i) => labels()[i]`) silently kept its SSR value forever — no `createEffect` update, no console error — while a sibling reactive `className`/`style` on the same element kept updating correctly.
