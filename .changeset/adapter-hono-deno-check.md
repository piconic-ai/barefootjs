---
"@barefootjs/hono": patch
---

Fix the two `deno check` errors in `@barefootjs/hono` that originate in our
own code: add the `override` modifier to `HonoAdapter.renderAsync` (TS4114,
matching the other adapters), and decode `readFile` output via `TextDecoder`
in the dev reloader instead of the positional string-encoding overload,
which Deno's `node:fs/promises` types resolve to a buffer without `.trim`
(TS2769 + TS2339). `override` is a type-only annotation and the dev-reloader
change is behaviorally equivalent.
