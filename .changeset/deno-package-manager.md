---
"@barefootjs/cli": minor
---

Support Deno as a package manager. `detectPackageManager` now recognises Deno projects (`deno.lock` / `deno.json` / `deno.jsonc`, or the Deno runtime via `process.versions.deno`), and `commandsFor('deno')` emits the `deno install` / `deno task` / `deno run -A npm:…` shapes. The published CLI bundle now imports Node builtins through the `node:` specifier so it loads under Deno as well as Node and Bun.
