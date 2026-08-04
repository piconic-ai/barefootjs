// Vite config loader: read a project's `vite.config.ts` through Vite's own
// `loadConfigFromFile`, never by parsing the file as text (CLAUDE.md's
// "never parse imports/TS syntax with regex or string matching" rule
// applies just as much to a whole config file, which is exactly where
// conditionals, env vars, and computed paths would break a text parser).
//
// The barefoot Vite plugin (`@barefootjs/vite`'s `barefoot()`, and every
// adapter's own `/vite` wrapper — `@barefootjs/go-template/vite`,
// `@barefootjs/hono/vite`, etc.) attaches its resolved `options` on
// `plugin.api` (`BarefootPluginApi`) — Vite's own convention
// (https://vite.dev/guide/api-plugin.html#plugin-ordering) for exposing
// plugin state to other tooling. This module finds that plugin by name in
// the loaded config's `plugins` array and reads `components` straight off
// it, instead of re-deriving anything from the file's source text.

import { existsSync } from 'fs'
import { dirname, resolve } from 'path'
import { loadConfigFromFile } from 'vite'
import type { Plugin, PluginOption } from 'vite'
import { PLUGIN_NAME } from '@barefootjs/vite'
import type { BarefootPluginApi } from '@barefootjs/vite'

const VITE_CONFIG_FILENAME = 'vite.config.ts'

/**
 * Search for `vite.config.ts` in the given directory. Returns the absolute
 * path if found, or null. Mirrors `config-loader.ts`'s `findBuildConfig`
 * exactly — same single-directory, single-extension scope (every
 * integration's config is `vite.config.ts`; no `.js`/`.mjs`/`.mts`
 * variants exist in this repo today, so supporting them is out of scope
 * here rather than guessed at).
 */
export function findViteConfig(startDir: string): string | null {
  const candidate = resolve(startDir, VITE_CONFIG_FILENAME)
  return existsSync(candidate) ? candidate : null
}

export interface ViteBarefootConfig {
  /**
   * Absolute path to the Vite project root the barefoot plugin resolves
   * `components` against. Equal to `dirname(configPath)` unless the config
   * itself sets `root` — see `loadViteBarefootConfig`'s guard on that case.
   */
  root: string
  /**
   * Raw `components` entries straight off the barefoot plugin's resolved
   * options — relative to `root` (or absolute), same shape
   * `barefoot.config.ts`'s `components` field had. Callers that `path.join`
   * this onto `projectDir` (`resolve-source.ts`, `meta-loader.ts`) keep
   * working unchanged as long as `projectDir === root`, which is exactly
   * what `context.ts` asserts by using `findViteConfig`'s own directory as
   * both.
   */
  sourceDirs: string[]
}

/**
 * Recursively await + flatten Vite's `PluginOption[]` (nested arrays,
 * falsy entries, and async plugin factories are all legal per Vite's own
 * `PluginOption = Thenable<Plugin | FalsyPlugin | PluginOption[]>` type)
 * into a flat `Plugin[]`. Every real `vite.config.ts` in this repo returns
 * a plain synchronous array from `barefoot()`, but a shallow `.flat()`
 * would silently miss a user's own nested grouping (`plugins: [...group1,
 * barefoot(...)]`) or an async plugin factory ahead of it in the array.
 */
async function flattenPlugins(plugins: PluginOption[] | undefined): Promise<Plugin[]> {
  if (!plugins) return []
  const out: Plugin[] = []
  for (const entry of plugins) {
    const resolved = await entry
    if (!resolved) continue
    if (Array.isArray(resolved)) {
      out.push(...(await flattenPlugins(resolved)))
    } else {
      out.push(resolved)
    }
  }
  return out
}

/**
 * Load `vite.config.ts` at `configPath` and pull the barefoot plugin's
 * resolved `components` off `plugin.api` (`BarefootPluginApi`).
 *
 * Returns null when the file has no barefoot plugin registered at all — a
 * `vite.config.ts` that exists for an unrelated reason (a different tool's
 * config living at the same project root) shouldn't behave any differently
 * than "no config" to the caller, which falls through to the
 * `barefoot.config.ts` / defaults chain (see `context.ts`).
 *
 * Throws when the config sets `root` to something other than its own
 * directory: every `sourceDirs` consumer downstream (`resolve-source.ts`,
 * `meta-loader.ts`) does `path.join(ctx.projectDir, dir)`, which only
 * produces the right path when `ctx.projectDir` (set to `dirname(configPath)`
 * by `context.ts`) IS the root `components` is relative to. No integration
 * in this repo sets `root` today (a search for "root:" across every
 * integration's vite.config.ts comes back empty) — this is a loud guard
 * against a future config silently mis-resolving `sourceDirs`, not a
 * currently-hit case.
 */
export async function loadViteBarefootConfig(configPath: string): Promise<ViteBarefootConfig | null> {
  const loaded = await loadConfigFromFile({ command: 'build', mode: 'production' }, configPath)
  if (!loaded) return null

  const plugins = await flattenPlugins(loaded.config.plugins)
  const barefootPlugin = plugins.find(p => p.name === PLUGIN_NAME)
  const api = barefootPlugin?.api as BarefootPluginApi | undefined
  if (!api?.options) return null

  const configDir = dirname(configPath)
  const root = loaded.config.root ? resolve(configDir, loaded.config.root) : configDir
  if (root !== configDir) {
    throw new Error(
      `vite.config.ts at "${configPath}" sets \`root\` to "${root}", which differs from the ` +
      `config file's own directory. The \`bf\` CLI does not yet support that layout — ` +
      `\`sourceDirs\` resolution assumes the two are the same.`,
    )
  }

  return { root, sourceDirs: [...api.options.components] }
}
