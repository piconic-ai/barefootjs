---
"@barefootjs/vite": patch
---

Restore the cross-language dev-reload sentinel (`<outDir>/.dev/build-id`) from `vite dev`

The legacy CLI's `bf build --watch` used to write `<outDir>/.dev/build-id`
after every rebuild that changed output; several adapter runtimes still
poll that exact path and push an SSE `event: reload` when it changes —
`bfdev.NewReloadHandler` (Go — echo/gin/chi/nethttp),
`Mojolicious::Plugin::BarefootJS::DevReload` / `BarefootJS::DevReload`
(Perl — mojolicious/xslate), and `barefoot_js/dev_reload.rb` (Ruby —
sinatra/rails). When those adapters' `build:watch` moved to `vite dev`,
nothing wrote the sentinel any more — the backend process kept picking up
fresh templates on every request (dev-mode template caching was already
off), but the open browser tab was never told to reload, so an edit only
showed up after a manual refresh.

`barefoot()`'s dev pass now writes a fresh timestamp to
`devSentinelPath(templatesDir)` — one directory above `templates`, matching
`packages/cli/src/lib/build.ts`'s `DEV_SENTINEL_SUBDIR`/
`DEV_SENTINEL_FILENAME` under `outDir` (every adapter following that
layout nests `templates` as a direct child of `outDir`, so the two
locations coincide) — on the initial pass and every subsequent rebuild,
mirroring the `.barefootjs-dev-build` marker's existing write lifecycle.
`writeBundle` (`vite build`) removes it, so a production build never
leaves a stale dev sentinel for a still-running dev backend to trip over.

Written unconditionally whenever `templates` is configured — no new
plugin option. Hono's own dev-reload story doesn't consume this file at
all (Cloudflare Workers detect a Worker-isolate restart directly via
`dev-worker.ts`'s boot id over the same SSE endpoint), so the write is
inert there.

Verified end-to-end (`vite dev` + the backend's own dev command, editing
`integrations/shared/components/Counter.tsx`) against `integrations/echo`
and `integrations/mojolicious`, restoring their documented dev flow with
zero changes to either integration or their Go/Perl runtime packages.
