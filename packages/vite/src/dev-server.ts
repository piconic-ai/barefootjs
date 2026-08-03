/**
 * Dev-server-only helpers for the `configureServer` hook: computing the
 * dev origin, building the two-URL `scriptAssets` list a `'use client'`
 * component needs in dev (the `@vite/client` HMR/full-reload socket plus
 * the component's own `.tsx` module), the localhost-only CORS default,
 * and the on-disk marker that flags a `templates` directory as holding
 * dev artifacts (localhost URLs baked in) rather than production output.
 *
 * The pure, easily-unit-tested pieces live here; the orchestration
 * (compiling, writing files, wiring the watcher) stays in `plugin.ts`
 * where the shared `CompileCache` / `componentDirs` / `templatesDir`
 * closures already live.
 */
import { sep } from 'node:path'
import type { ResolvedConfig, ViteDevServer } from 'vite'
import { joinBaseAndFile } from './manifest.ts'

/**
 * Vite's absolute-path passthrough prefix (`/@fs/…`, `FS_PREFIX` in Vite's
 * own source) for serving files outside the project root. Needed because
 * `components` dirs are commonly siblings of the Vite project root in this
 * monorepo's real layouts — an app's `vite.config.ts` root is the backend
 * app directory, while shared components live in a sibling `ui/`-style
 * directory Vite's default dev serving otherwise refuses (only `root` and
 * its subdirectories are served as plain paths).
 */
const FS_SERVE_PREFIX = '@fs'

/**
 * Localhost-only CORS default this plugin fills in — ONLY when the user
 * hasn't configured `server.cors` themselves (see the `config` hook in
 * `plugin.ts`). Vite 6+ defaults `cors` to same-origin-only, which breaks
 * the cross-origin split this plugin sets up (the page is rendered by the
 * backend on its own origin; modules are served by Vite on another)
 * unless something opts localhost origins in. Deliberately not a wildcard
 * `true` — see the PR brief for the reasoning.
 */
export const DEFAULT_DEV_CORS_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/

/** Posix-normalize an absolute filesystem path (Windows uses `sep`; POSIX
 * paths already use `/`). */
function toPosixAbsolute(absPath: string): string {
  return absPath.split(sep).join('/')
}

/**
 * The request path (relative to `config.base`, no leading slash) a browser
 * must use to reach `absPath` through Vite's dev server: a root-relative
 * path when `absPath` is under `config.root`, or Vite's `/@fs/`
 * absolute-path passthrough when it isn't.
 */
export function devRequestPath(config: Pick<ResolvedConfig, 'root'>, absPath: string): string {
  const posixAbs = toPosixAbsolute(absPath)
  const posixRoot = toPosixAbsolute(config.root)
  if (posixAbs === posixRoot) return ''
  if (posixAbs.startsWith(`${posixRoot}/`)) return posixAbs.slice(posixRoot.length + 1)
  return `${FS_SERVE_PREFIX}${posixAbs}`
}

/** Full absolute URL (origin + `base` + request path) for `absPath` under
 * the dev server. */
export function devModuleUrl(
  config: Pick<ResolvedConfig, 'root' | 'base'>,
  origin: string,
  absPath: string,
): string {
  return `${origin}${joinBaseAndFile(config.base, devRequestPath(config, absPath))}`
}

/**
 * The ordered `scriptAssets` a `'use client'` component needs in dev: the
 * `@vite/client` HMR/full-reload socket first (so the page always gets a
 * live-reload connection), then the component's own module — Vite serves
 * it plain-JS via this plugin's `transform` hook exactly like it would any
 * other dev module, no different from a production entry. Per the design,
 * server-only components (no `'use client'`) get `[]` — computed by the
 * caller without consulting this function at all, see `plugin.ts`.
 */
export function devScriptAssets(
  config: Pick<ResolvedConfig, 'root' | 'base'>,
  origin: string,
  absPath: string,
): string[] {
  return [
    `${origin}${joinBaseAndFile(config.base, '@vite/client')}`,
    devModuleUrl(config, origin, absPath),
  ]
}

/**
 * The dev origin to bake into `scriptAssets`: the user's own
 * `server.origin` if they set one, otherwise `http://localhost:<port>`
 * using the port Vite actually bound — NOT the configured port, which can
 * be wrong (Vite auto-increments past an in-use port unless `strictPort`
 * is set). Also writes the computed default back onto
 * `server.config.server.origin` so Vite's OWN asset-URL rewriting
 * (`import.meta.url`, CSS `url()`, etc.) agrees with the URLs this plugin
 * bakes into templates — both need to match for the cross-origin split
 * (page from the backend, assets from Vite) to work end to end.
 *
 * Call only after the server is actually listening (`httpServer`'s
 * `'listening'` event) — the resolved port isn't known before then.
 */
export function resolveDevOrigin(server: ViteDevServer): string {
  const configured = server.config.server.origin
  if (configured) return configured

  const address = server.httpServer?.address()
  const port = address && typeof address === 'object' ? address.port : (server.config.server.port ?? 5173)
  const origin = `http://localhost:${port}`
  server.config.server.origin = origin
  return origin
}

/**
 * Filename of the marker BarefootJS writes at the root of `templates`
 * while the dev server is running, so a stray `git add` or a production
 * deploy of dev-only output (localhost URLs baked into every template) is
 * obvious before it ships. `writeBundle` (the `vite build` path) removes
 * it — see `plugin.ts`.
 *
 * A per-template, per-adapter comment (Go `{{/* … *\/}}`, ERB `<%# … %>`,
 * etc.) would pinpoint the problem more precisely, but needs new surface
 * on every `TemplateAdapter` implementation across 9+ adapter packages —
 * out of scope for a dev-server PR that touches none of them. The brief
 * explicitly allows this single-file fallback in that case.
 */
export const DEV_ARTIFACT_MARKER_FILENAME = '.barefootjs-dev-build'

export const DEV_ARTIFACT_MARKER_CONTENT = `This directory currently holds DEV BUILD OUTPUT from @barefootjs/vite's
dev server, not a production build.

Every template in this directory has dev-only URLs baked into it
(http://localhost:<port>/...) pointing at the Vite dev server. They will
break if committed, deployed, or served without that dev server running.

Run \`vite build\` to regenerate this directory with real, hashed,
production asset URLs — the build overwrites every template here and
removes this file.
`
