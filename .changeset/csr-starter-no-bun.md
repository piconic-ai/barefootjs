---
"@barefootjs/cli": patch
---

Stop pushing the Bun runtime onto users who didn't pick it.

- CSR starter: the scaffold's `server.ts` now runs on plain `node:http` +
  `node:fs` (launched via `tsx`, matching the hono-node starter) instead of
  `Bun.serve` / `Bun.file`, so npm / pnpm / yarn users are no longer forced
  to install Bun. Scripts use `tsx`, deps use `@types/node` + `tsx` instead
  of `@types/bun`, and the Bun-on-PATH prerequisite warning is gone. The
  server still runs unchanged under Bun or Deno.
- Mojolicious / Go (Echo, Gin, Chi, net/http) starters: prerequisite
  warnings and the generated server's "did you run the build?" hint no
  longer hardcode `bun run dev` / `bun run build` — they're now PM-neutral
  (`bf build`, "before starting the dev server"), since these strings are
  shown to every user regardless of their package manager.
