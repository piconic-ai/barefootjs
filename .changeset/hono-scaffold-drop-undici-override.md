---
"@barefootjs/cli": patch
---

The Hono (Cloudflare Workers) scaffold no longer pins an
`overrides.undici` entry in the generated `package.json`, and the
scaffolded README no longer carries the "Dependency overrides" section
explaining it. The override was a bridge over `miniflare` pinning an
exact vulnerable `undici` release; `miniflare` re-pinned upstream
(`undici@7.29.0` as of `miniflare@5.20260801.1-alpha`, resolved by the
scaffold's `wrangler@^4.0.0`), so a fresh scaffold now passes
`npm audit` with no override present. Existing projects that carry the
override can safely delete it.
