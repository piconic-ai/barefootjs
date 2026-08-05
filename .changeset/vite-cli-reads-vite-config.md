---
"@barefootjs/vite": minor
"@barefootjs/cli": minor
---

`bf` reads project config from `vite.config.ts`, unblocking deletion of the legacy build pipeline

All nineteen integrations are migrated to `@barefootjs/vite`, but twenty-two
`bf` commands (`docs`, `debug graph`, `debug profile`, `gen-component`,
`gen-test`, `meta extract`, `search`, `tokens`, `preview`, and more) still
derived their project context — `paths` and `sourceDirs` — from
`barefoot.config.ts` via `packages/cli/src/context.ts`. Deleting the legacy
config before repointing that context would break every one of them. This
PR does the repointing; it deletes nothing.

**`@barefootjs/vite`**: `barefoot()` now attaches its resolved `options` on
the returned plugin's `.api` (`BarefootPluginApi`), Vite's own convention
for exposing plugin state to other tooling. `PLUGIN_NAME` (`'barefoot'`) is
exported alongside it so a consumer can find the plugin by name in a
resolved Vite config's `plugins` array without hardcoding the string
independently. Populated synchronously at `barefoot(options)` construction
time — not from a lifecycle hook — because a caller going through Vite's
own `loadConfigFromFile` (see below) never runs a plugin's hooks at all.

**Every adapter's `/vite` wrapper** (`@barefootjs/go-template/vite`,
`@barefootjs/hono/vite`, and the blade/erb/jinja/mojolicious/rust/twig/
xslate equivalents) already returns the SAME plugin object core constructed
as one element of its `Plugin[]` array, so `.api` survives unchanged
through every wrapper with no code changes needed there — pinned by a new
test in each of the two adapters most exercised elsewhere in this repo
(`go-template`, `hono`) asserting `plugins[0].api.options` unchanged.

**`@barefootjs/cli`**: `context.ts` now resolves project config from
`vite.config.ts` first, reading the barefoot plugin's `components` off
`plugin.api` via Vite's own `loadConfigFromFile` (never by text-parsing the
config file — see CLAUDE.md's "never parse imports/TS syntax with regex or
string matching" rule). `barefoot.config.ts` remains a fallback — read
directly, exactly as before — for a directory that has only that file, or
when `vite.config.ts` fails to load or has no barefoot plugin registered.
The existing "no config found anywhere" monorepo-fallback behavior (so
setup commands like `bf init` still work with zero config) is unchanged.
`paths` has no equivalent on the Vite side (`BarefootViteOptions` has no
`paths` field — no integration overrides `paths`, and there is no root or
`ui/` config either), so the `vite.config.ts` path always uses
`DEFAULT_PATHS`.

Verified against real commands (`bf docs`, `bf debug graph`, `bf tokens`,
`bf meta extract`) run from inside a migrated integration with
`vite.config.ts` present, and again from a project with only
`barefoot.config.ts` (no `vite.config.ts`) to confirm the fallback.
