---
"@barefootjs/cli": patch
---

Fix fresh Hono/Cloudflare scaffolds failing `npm install` with ERESOLVE again: wrangler 4.108.0 (which had moved its `peerOptional @cloudflare/workers-types` to `^5.20260706.1`) was deprecated by its publisher the same day it shipped ("causing deployment failures in CI ... downgrade to 4.107.1"). npm's resolver skips a deprecated version when satisfying a semver range, so `wrangler: '^4.0.0'` now resolves back to `4.107.1`, which peers on `^4.20260702.1` — conflicting with the `^5.20260706.1` pin from the previous fix (bun tolerates the mismatch; npm does not — caught by the smoke-publish CI gate). The `bf init` / create-barefootjs Hono template now pins `@cloudflare/workers-types@^4.20260702.1` again, matching whichever wrangler version npm actually resolves rather than whichever version last shipped upstream. Verified end-to-end with `bun run scripts/smoke-publish.mjs` (full pack + scaffold + `npm install` + `npm run build`/`test`).
