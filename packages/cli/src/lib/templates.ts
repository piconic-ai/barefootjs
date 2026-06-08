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
 * generated `package.json` quotes the right command (`bunx wrangler`
 * vs. `npx wrangler` vs. `pnpm dlx wrangler` vs. `yarn dlx wrangler`).
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

// CSS library options offered by `bf init`. The library is
// currently a presentational choice — the Hono adapter wires UnoCSS
// directly, and additional libraries (Tailwind, etc.) will eventually
// contribute their own files/scripts/deps once an adapter supports
// more than one. The registry exists so `--css` and the interactive
// selector have a real surface to pivot on.
export interface CssLibraryTemplate {
  /** Human-readable name shown in CLI output. */
  label: string
}

export const CSS_LIBRARIES: Record<string, CssLibraryTemplate> = {
  unocss: { label: 'UnoCSS' },
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
