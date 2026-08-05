export { barefoot, PLUGIN_NAME } from './plugin.ts'
export { barefoot as default } from './plugin.ts'
export type { AfterEmitContext, BarefootPluginApi, BarefootViteOptions } from './types.ts'

// Re-exported so an adapter's own `/vite` subpath (e.g.
// `@barefootjs/go-template/vite`) can resolve script/asset URLs the SAME
// way this plugin's own `writeBundle`/`configureServer` do, for entries
// this plugin's own component discovery never sees (e.g. a hand-written
// client bootstrap script) — reused, not re-derived, per CLAUDE.md.
export { loadManifest, resolveScriptAssets, joinBaseAndFile } from './manifest.ts'
export { devModuleUrl, devRequestPath, resolveDevOrigin } from './dev-server.ts'
export { toPosixRelative } from './paths.ts'

// Re-exported for the same reason: a host framework with no per-request
// script collector (h3, Elysia — see `@barefootjs/hono/vite`'s docstring)
// has to build its OWN full component-name -> URL map (there is no
// per-request SSR collector to derive it from at request time), via the
// SAME `assets` mechanism `@barefootjs/go-template/vite`/`@barefootjs/hono/
// vite` already expose for a single hand-written entry — just populated
// from every discovered `'use client'` file instead of one path. Reusing
// this plugin's own discovery (rather than re-walking `components` dirs
// with ad hoc, possibly-diverging logic) is exactly the CLAUDE.md
// "reuse or port it, don't reinvent" rule this module's own docstring
// already invokes.
export { discoverComponents, type DiscoveredComponent } from './discover.ts'
