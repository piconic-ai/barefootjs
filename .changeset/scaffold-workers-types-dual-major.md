---
"@barefootjs/cli": patch
---

Stop fresh Hono/Cloudflare scaffolds from failing `npm install` with ERESOLVE whenever wrangler flips which `@cloudflare/workers-types` major it peers on. wrangler has bounced between `^4` (4.107.1) and `^5` (4.108.0 deprecated same-day, then 4.110.0) across recent point releases, and each flip broke the scaffold's single-major pin (bun tolerates the mismatch; npm does not — caught by the smoke-publish CI gate). The `bf init` / create-barefootjs Hono template now pins `@cloudflare/workers-types` to `^4.20260702.1 || ^5.20260708.1`, so npm installs whichever major the resolved wrangler actually peers on — v5 today, v4 automatically if a deprecation falls back to a v4-peering wrangler — with no ERESOLVE either way. Verified end-to-end against both wrangler 4.110.0 (peers v5) and 4.107.1 (peers v4).
