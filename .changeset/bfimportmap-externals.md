---
"@barefootjs/hono": patch
---

`BfImportMap` now consumes `barefoot-externals.json` (#1639):

- Add an optional `externals` prop (the parsed manifest). Its `importmap.imports` merge on top of the built-in `@barefootjs/client*` mappings, so islands importing configured externals (`zod`, `@barefootjs/form`, …) resolve in the browser instead of 404ing on bare specifiers.
- Emit `<link rel="modulepreload">` for the manifest's `preloads`, toggleable via a new `preload` prop (defaults to `true`).
- Keeps `app.ts` runtime-agnostic — the caller imports the JSON and passes it through, matching how `BfScripts` already takes `manifest`. Omitting `externals` preserves the prior client-only output.
