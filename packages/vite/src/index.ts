export { barefoot } from './plugin.ts'
export { barefoot as default } from './plugin.ts'
export type { AfterEmitContext, BarefootViteOptions } from './types.ts'

// Re-exported so an adapter's own `/vite` subpath (e.g.
// `@barefootjs/go-template/vite`) can resolve script/asset URLs the SAME
// way this plugin's own `writeBundle`/`configureServer` do, for entries
// this plugin's own component discovery never sees (e.g. a hand-written
// client bootstrap script) — reused, not re-derived, per CLAUDE.md.
export { loadManifest, resolveScriptAssets, joinBaseAndFile } from './manifest.ts'
export { devModuleUrl, devRequestPath, resolveDevOrigin } from './dev-server.ts'
export { toPosixRelative } from './paths.ts'
