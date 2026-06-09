---
"@barefootjs/cli": patch
---

fix(profile): resolve preview-only components via `index.preview.tsx` (#1849 B5)

A monorepo component directory that ships only `index.preview.tsx` (no `index.tsx`, e.g. `settings-form`) now resolves to the preview — noted on stderr, never polluting `--json` stdout — instead of erroring with "Cannot find component". `index.tsx` still wins when both exist.
