// Adapter and CSS-library registries consumed by `bf init`.
//
// The actual template content for each adapter lives under
// `./adapters/<name>.ts` so this file stays focused on registration
// surface (types, the registry maps, and defaults).

import { CHI_ADAPTER } from './adapters/chi'
import { CSR_ADAPTER } from './adapters/csr'
import { ECHO_ADAPTER } from './adapters/echo'
import { GIN_ADAPTER } from './adapters/gin'
import { HONO_ADAPTER } from './adapters/hono'
import { HONO_NODE_ADAPTER } from './adapters/hono-node'
import { MOJO_ADAPTER } from './adapters/mojo'
import { NETHTTP_ADAPTER } from './adapters/nethttp'
import { XSLATE_ADAPTER } from './adapters/xslate'
import type { PackageManager } from './pm'

/**
 * A package-manager-aware script value. Plain strings are emitted
 * verbatim; functions are evaluated against the detected PM so the
 * generated `package.json` quotes the right PM-specific command. Tools
 * an adapter depends on directly (e.g. Hono's `wrangler`) should be
 * added to `devDependencies` and invoked bare in the script string —
 * package.json scripts resolve `node_modules/.bin` automatically, so
 * no `npx`/`bunx`/`pnpm dlx`/`yarn dlx` wrapper (and no unpinned
 * first-run download) is needed. Reach for a function value only when
 * the command genuinely differs per PM (e.g. `<pm> install`).
 */
export type AdapterScriptValue = string | ((pm: PackageManager) => string)

export interface AdapterTemplate {
  /** Human-readable name shown in the live arrow-key menu. */
  label: string
  /**
   * Optional compact label for the post-pick confirmation line. Used
   * when two adapters share a root noun ("Hono / Cloudflare Workers"
   * vs. "Hono / Node") and the default `(...)` strip would render
   * both as just "Hono".
   */
  shortLabel?: string
  /** Default port the generated dev server listens on. */
  port: number
  /** Files (relative path → contents) the adapter contributes. */
  files: Record<string, string>
  /**
   * package.json scripts the adapter contributes. Values may be
   * functions to render PM-specific commands at scaffold time.
   */
  scripts: Record<string, AdapterScriptValue>
  /** package.json runtime dependencies. */
  dependencies: Record<string, string>
  /** package.json dev dependencies. */
  devDependencies: Record<string, string>
  /**
   * Optional forced-version entries for *transitive* dependencies the
   * scaffold's package.json should carry — e.g. a dep that pins its own
   * dependency to an exact (non-range) vulnerable version, which leaves
   * `npm audit fix` with nothing to bump even when a patched release
   * exists upstream. Keys must be flat (`{ pkg: "range" }`), never
   * nested/scoped (`{ parent: { pkg: "range" } }`) — bun does not
   * support nested overrides (as of bun 1.3.11: it warns and silently
   * ignores the entry, leaving the vulnerable version installed), and
   * this repo treats bun as a first-class scaffold target. `bf init`
   * (`../commands/init.ts`'s `overridesField`) renders this map into
   * whichever field name/shape the *detected* package manager actually
   * reads (npm/bun/deno: top-level `overrides`; pnpm: nested
   * `pnpm.overrides`; yarn: top-level `resolutions`) — getting that
   * per-PM shape wrong is worse than omitting it: an `overrides` key a
   * PM silently no-ops on (verified: pnpm 10 does this) looks like
   * protection without providing any. Omitted entirely when an adapter
   * needs none, so plain scaffolds don't carry a stray empty key.
   */
  overrides?: Record<string, string>
  /**
   * Human-readable explanation of why `overrides` exists, rendered into
   * the scaffolded README (see `generateReadmeMd` in `../lib/readme.ts`)
   * rather than left undiscoverable in the framework's own source
   * comments. `package.json` is JSON — it can't carry a comment — so
   * without this, the override is a stray-looking block in a file the
   * *user* now owns and maintains, with no way to learn why it's there
   * or when it's safe to delete. Required whenever `overrides` is set;
   * should name the upstream cause and link a tracking issue for
   * removal once it's no longer needed.
   */
  overridesNote?: string
  /**
   * Optional deploy hint surfaced as a dedicated "Deploy:" section in
   * the post-scaffold guide. Adapters that don't have an obvious one-
   * command deploy story (Echo, Mojolicious, CSR) leave this unset
   * and the section is suppressed.
   */
  deploy?: {
    /** Section subtitle, e.g. "Cloudflare Workers". */
    target: string
    /** Script key in `scripts` that runs the deploy. */
    script: string
  }
  /**
   * Prerequisite warnings to surface to the user before scaffolding.
   * Returning a non-empty array signals "this adapter needs tools that
   * may not be installed" — init prints them but does not abort.
   */
  prereqWarnings: () => string[]
  /**
   * Extra setup commands to insert into the printed "Get started:"
   * guide after `cd <dir>` and before `<pm> install`. Each entry is
   * either a {label, command} pair (renders the label as a comment-
   * styled line above the command — useful for grouping multi-line
   * setup hints) or a bare command string. Used by adapters whose
   * runtime is not bundled via `npm install` (e.g. Mojolicious +
   * cpanm — issue #1416 item 2).
   */
  extraSetupSteps?: { label?: string; command: string }[]
  /**
   * Registry components fetched into `components/ui/` at init. Defaults
   * to `['button']`, matching what the starter Counter expects across
   * every supported adapter (Hono, CSR, Echo, Mojo). Adapters that
   * later grow an unsupported-lowering blocker for a registry
   * component can set this to `[]` to skip the auto-install while
   * the gap closes; today every adapter ships with the registry
   * `<Button>` ready out of the box.
   */
  bundledRegistryComponents?: string[]
}

// CSS library options offered by `bf init`. Two paths today:
//   - `unocss` (default): wires UnoCSS + the barefootjs UI registry — the
//     adapter templates are authored for this path (uno.config.ts, the
//     uno.css/tokens.css/styles.css sheets, the registry <Button> the
//     starter Counter uses).
//   - `none`: bring your own CSS. No UnoCSS config/deps/scripts, no
//     registry fetch, no stylesheets — just the JSX→template+signal
//     compiler output and a self-contained Counter. `usesUnoUi: false`
//     drives the scaffold transforms in lib/css.ts.
// Additional libraries (Tailwind, etc.) can slot in here once an adapter
// grows first-class support for them.
export interface CssLibraryTemplate {
  /** Human-readable name shown in CLI output. */
  label: string
  /**
   * Whether this option pulls in UnoCSS + the barefootjs UI registry.
   * Defaults to `true`. When `false`, `bf init` skips the registry probe
   * and Button fetch, omits the UnoCSS config/deps/sheets, strips
   * `unocss` from the package.json scripts, and ships the bare starter
   * Counter.
   */
  usesUnoUi?: boolean
}

export const CSS_LIBRARIES: Record<string, CssLibraryTemplate> = {
  unocss: { label: 'UnoCSS', usesUnoUi: true },
  none: { label: 'None (bring your own CSS)', usesUnoUi: false },
}

export const DEFAULT_CSS_LIBRARY = 'unocss'

// Adapter listing order = menu order. Hono leads with the
// "instantly deployable" Cloudflare Workers variant; the Node variant
// follows for users who want the familiar `node server.tsx` loop.
export const ADAPTERS: Record<string, AdapterTemplate> = {
  hono: HONO_ADAPTER,
  'hono-node': HONO_NODE_ADAPTER,
  echo: ECHO_ADAPTER,
  gin: GIN_ADAPTER,
  chi: CHI_ADAPTER,
  nethttp: NETHTTP_ADAPTER,
  mojo: MOJO_ADAPTER,
  xslate: XSLATE_ADAPTER,
  csr: CSR_ADAPTER,
}

export const DEFAULT_ADAPTER = 'hono'
