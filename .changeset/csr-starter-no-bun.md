---
"@barefootjs/cli": patch
---

Drop the Bun runtime requirement from the CSR starter. The scaffold's
`server.ts` now runs on plain `node:http` + `node:fs` (launched via `tsx`,
matching the hono-node starter) instead of `Bun.serve` / `Bun.file`, so a
user on npm / pnpm / yarn is no longer forced to install Bun. The dev/start
scripts use `tsx`, the scaffold depends on `@types/node` + `tsx` instead of
`@types/bun`, and the Bun-on-PATH prerequisite warning is gone. The server
still runs unchanged under Bun or Deno.
