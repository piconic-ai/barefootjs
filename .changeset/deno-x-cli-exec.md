---
"@barefootjs/cli": patch
---

Fix Deno one-shot command hints and adopt `deno x`. `commandsFor('deno').exec` now emits `deno x npm:<pkg>` (Deno 2.6+, the `npx` equivalent that defaults to `--allow-all`) instead of `deno run -A npm:<pkg>`. Generated Deno project scripts (e.g. `wrangler dev`/`deploy`) therefore use `deno x` and now require Deno 2.6+.

Component install snippets are also corrected to reference the published package `@barefootjs/cli` rather than the bare bin name `bf` — the latter resolves to an unrelated npm package when run cold (outside a project that already has the CLI installed).
