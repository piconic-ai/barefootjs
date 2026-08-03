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

Three fixes from review, all with regression coverage:

- **`server.cors: false` was silently overridden.** The "fill in only when
  unset" check was `!userConfig.server?.cors`, and `!false` is `true` — a
  user explicitly disabling CORS got the localhost default instead, the
  opposite of what they asked for. Fixed to check `=== undefined`
  specifically; falsy-but-set (`false`) now survives untouched, same as any
  other explicit value.
- **Adding or deleting a component file during a dev session did nothing.**
  Only `'change'` was handled; chokidar emits `'add'` and `'unlink'`
  separately. A new file got no template until some unrelated file
  happened to change and dragged it along on the next full pass; a deleted
  file's template lingered on disk forever. Both are now handled: `'add'`
  triggers the same eager pass as `'change'` (it already re-discovers
  everything from disk, so no special-casing is needed for a new file);
  `'unlink'` additionally needs to know WHICH on-disk files to remove for a
  source that no longer exists to re-derive that from — solved by having
  the eager pass record what it last emitted per source file
  (`lastEmitsByAbsPath`), consulted (and then discarded, along with the
  now-stale `CompileCache` entry) when a file disappears.
- **Rapid successive changes could run overlapping eager passes**, all
  writing the same template files with no serialization — a save-twice-
  quickly, a multi-file save, or a `git checkout` touching many files could
  trigger this, exactly the race the legacy CLI's `watch()`
  (`packages/cli/src/lib/build.ts`) debounced at 100ms to avoid. Added
  `debounced-serial-runner.ts`: a small, dependency-free primitive that
  debounces a burst of triggers into one run and, if a run is already in
  flight when the debounce fires, queues exactly one follow-up instead of
  starting a second overlapping one — a change arriving mid-pass is
  delayed, never dropped, and at most one pass is ever active. Proven
  deterministically in its own unit tests (via manually-resolved promises
  standing in for the real eager pass, since the real one finishes in
  low-single-digit milliseconds — far too fast to reliably force a
  wall-clock race in an e2e test); backed by an end-to-end test confirming
  real rapid disk writes converge on the correct final template content
  with no corruption and no crash.

Out of scope for this change: migrating any `integrations/*` app to the new
plugin, `packages/cli`, and combining adapter `types` output into one
backend-native file (still tracked as a follow-up, unrelated to the dev
server).
