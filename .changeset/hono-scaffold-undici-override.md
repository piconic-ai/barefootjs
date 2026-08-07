---
"@barefootjs/cli": patch
---

The Hono (Cloudflare Workers) scaffold now pins an `overrides.undici`
entry in the generated `package.json`. `wrangler` pulls in `miniflare`,
which pins `undici` to an exact (non-range) version that carries several
known advisories — so even the latest resolvable `wrangler` left fresh
scaffolds with `npm audit` reporting vulnerabilities that `npm audit fix`
couldn't clear. Adapters that don't depend on `wrangler`/`miniflare`
are unaffected.
