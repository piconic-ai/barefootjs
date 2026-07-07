---
"@barefootjs/cli": patch
---

Fix fresh Hono/Cloudflare scaffolds failing `npm install` with ERESOLVE: wrangler 4.108.0 moved its `peerOptional @cloudflare/workers-types` to `^5.20260706.1`, conflicting with the template's `^4.20250101.0` pin (bun tolerates the mismatch; npm does not — caught by the smoke-publish CI gate). The `bf init` / create-barefootjs Hono template now pins `@cloudflare/workers-types@^5.20260706.1`; v5 still ships a root `index.d.ts`, so the generated tsconfig's `"types"` entry resolves unchanged.
