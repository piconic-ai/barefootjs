---
"@barefootjs/vite": minor
---

Make `templates` optional, and migrate `integrations/csr` — the last of the nineteen

`integrations/csr` is unlike the other eighteen: it emits no templates and
does no SSR, so it needed no answer to "does `@barefootjs/client` need its
own `/vite` package?" — it doesn't. Plain `@barefootjs/vite`'s `barefoot()`
with `new CSRAdapter()` (`@barefootjs/client/build`'s existing sentinel
adapter — `generate()` always returns empty output) covers it exactly.
`CSRAdapter` is still required, not skippable: the compiler's analyzer
consults `TemplateAdapter.acceptsTemplateCall` when deciding template- vs.
init-scope placement for a call expression, so CSR still needs *an* adapter
— just one whose output is thrown away.

## The one thing core needed: the degenerate "no real template" case

The eager pass previously wrote one `markedTemplate` file per discovered
component unconditionally — for CSR that's a directory of empty `.tsx`
files, exactly what the legacy CLI's `clientOnly` gate always avoided.
`BarefootViteOptions.templates` is now optional; when omitted, the eager
pass still compiles every discovered component (the graph pass needs the
same canonical compile regardless of `templates`) but writes nothing on
its behalf — no per-component template/`ssrDefaults`/types files, no
`manifest.json`, no dev-artifact marker, no `afterEmit` call.

Omitting `templates` is a claim this plugin verifies, not trusts:
`assertNoRealTemplateOutput` refuses loudly if any discovered component's
`markedTemplate` output turns out non-empty anyway, rather than silently
dropping it — CLAUDE.md's sound-or-loud idiom, applied here. The check is
scoped to `markedTemplate` content specifically, not any adapter output:
`ssrDefaults` is derived from IR metadata independent of the adapter, and
IS real even under `CSRAdapter` (a `Counter`'s signal default produces a
non-empty `ssrDefaults` file regardless of what `generate()` returns) —
treating it as loudness-worthy would make `templates` impossible to omit
for the one adapter this option exists to accommodate. This matches the
legacy CLI's own `clientOnly` gate exactly, which drops `ssrDefaults`
alongside the template rather than failing over it.

## What CSR revealed the other eighteen couldn't

CSR's `pages/*.html` are a genuinely different shape: static, hand-written
HTML files with an inline `<script type="module">`, not a per-request
server-rendered template. Each one hand-imported a fixed, un-hashed path
(`/static/components/Counter.client.js`, matching the legacy CLI's
un-bundled output layout) and carried a hand-written `@barefootjs/client*`
import map (`{"@barefootjs/client/runtime": "/static/components/
barefoot.js"}`) so the browser's native module loader could resolve the
bare specifier its own inline script used — CSR's answer to the "hand-
written import map" every other integration has already deleted, just for
a different reason (there being no SSR shell to embed it in) than the
usual "Vite bundling already resolves this" one.

Fixed by routing every `pages/*.html` through Vite's own multi-page build
(`build.rollupOptions.input`, merged with `barefoot()`'s own component-
derived entries) instead of serving them as static passthrough files:
Vite rewrites each page's inline script into a real, hashed, bundled
entry, resolving both the dynamic `import()` of the component `.tsx` file
(now a plain relative import, e.g. `../../shared/components/Counter.tsx`)
and the `@barefootjs/client/runtime` bare specifier — no import map
needed. `server.ts` now serves the built `dist/pages/*.html`, not the
`pages/` source directory.

One CSR-specific consequence for `build:watch`: every other migrated
integration maps it to `vite dev`, pairing a backend dev script that reads
`templates` at request time and renders a `<script src>` pointing at
Vite's own dev-server origin. CSR has no such backend step to bake a
dev-origin URL into — its pages are the shell. `build:watch` instead runs
`vite build --watch`, preserving CSR's actual prior dev loop (rebuild to
`dist/` on save, reload the browser) rather than wiring up a cross-origin
split that would silently never take effect.

`barefoot.config.ts` stays, unused, until a later PR removes the legacy
CLI outright. `integrations/csr`'s 79-test Playwright E2E suite passes
against the migrated build with the same single pre-existing, unrelated
failure (`ToggleItem` scope-ID format) reproduced identically against the
legacy build — not a regression from this migration.
