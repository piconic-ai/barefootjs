---
"@barefootjs/vite": minor
---

Add the dev server: `configureServer` wires `vite dev` up to real BarefootJS templates

The prior PR gave `@barefootjs/vite` its build-time engines (`transform` for
client JS, `writeBundle` for templates). This PR adds the third:
`configureServer`, so `vite dev` emits real, working templates too — not
just `vite build`.

- **`server.watcher.add(componentDirs)` is mandatory, not a nicety.** Vite's
  own chokidar watcher only reliably covers its project `root` (plus config
  file dependencies) and whatever it has personally transformed as a module
  (`ensureWatchedFile`). Server-only components (no `'use client'`) are
  never transformed as modules — nothing ever imports them as a script —
  and in this monorepo's real layouts `components` dirs are commonly
  siblings of, not descendants of, the Vite project root (an app's
  `vite.config.ts` root is the backend app dir; components live in a shared
  `ui/`-style directory next to it). Without the explicit `add`, editing
  such a file is silently invisible to the dev server. The e2e suite pins
  this with a dedicated server instance that never fetches any `'use
  client'` component over HTTP, specifically to rule out Vite's own
  `ensureWatchedFile` accidentally covering the gap.
- **Every tracked `.tsx` change re-runs the WHOLE eager pass**, not a
  dependency-tracked diff. A change to a shared signal module or a child
  component changes the *parent's* template too; anything less than a full
  re-run needs the dependency tracking this migration is deleting from the
  legacy CLI's `build-cache.ts`. The eager pass's existing content-hash
  `CompileCache` absorbs the cost — an unchanged file's compile is a cache
  hit regardless of which pass reaches it.
- **`scriptAssets` for a dev `'use client'` component** is `[origin +
  '/@vite/client', origin + <the component's own dev module URL>]` — the
  HMR/full-reload socket, then the component itself, served exactly like
  any other dev module via the SAME `transform` hook `vite build` uses (no
  dev-only compile path). Server-only components still get `[]`. The
  origin is resolved from the httpServer's ACTUAL bound port
  (`httpServer.address()`), never the configured one, because Vite
  auto-increments past an in-use port unless `strictPort` is set — and it's
  written back onto `server.config.server.origin` so Vite's own asset-URL
  rewriting (`import.meta.url`, CSS `url()`) agrees with what this plugin
  bakes into templates.
- **`server.cors` gets a localhost-only default, ONLY when the user hasn't
  set one.** The page is rendered by the backend on its own origin; its
  module scripts come from Vite on another — a cross-origin split Vite 6+'s
  same-origin CORS default would reject outright. The plugin option surface
  stays exactly `adapter` / `components` / `templates`; no fourth
  `devOrigin`-shaped option was added to support this. Done in the `config`
  hook (not `configureServer`) so it's plain, synchronously mergeable data
  Vite applies before installing its own CORS middleware, not a hook-timing
  bet against Vite's internal setup order.
- **Dev-artifact marker.** `templates/.barefootjs-dev-build` is written
  alongside every dev-emitted template and removed by the next `vite build`
  — a warning that the directory currently holds dev-only URLs
  (`http://localhost:<port>/...`) that will break if committed or deployed.
  A per-adapter template comment (Go `{{/* … */}}`, ERB `<%# … %>`, etc.)
  would pinpoint the problem more precisely, but needs new surface on every
  `TemplateAdapter` implementation across 9+ adapter packages unrelated to
  the dev server itself — out of scope here. This single marker file is the
  fallback the design brief explicitly allows in that case.

Full reload (`server.ws.send({ type: 'full-reload' })`), not fine-grained
HMR, is correct here and not a placeholder: the page HTML is rendered by the
backend (Go/PHP/Ruby), not by Vite, so a component's compiled output can
only take effect on the next full backend render. Fine-grained HMR would
need to cross a boundary this architecture doesn't have yet.

Out of scope for this change: migrating any `integrations/*` app to the new
plugin, `packages/cli`, and combining adapter `types` output into one
backend-native file (still tracked as a follow-up, unrelated to the dev
server).
