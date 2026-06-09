---
"@barefootjs/cli": patch
---

fix(profile): actionable error for external `@barefootjs/client` imports under `--scenario auto` (#1849 B3)

When a component depends on an external `@barefootjs` package whose compiled output imports `@barefootjs/client` directly (e.g. the cached `@barefootjs/xyflow` build), `--scenario auto` now explains the failure and points at a pre-bundled `--scenario <story.tsx>` or the static budget, instead of surfacing a raw module-resolution stack.
