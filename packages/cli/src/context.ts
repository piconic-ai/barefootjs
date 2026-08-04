// CLI context: shared configuration passed to every command.

import { existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'node:url'
import type { BarefootBuildConfig } from './config'
import { DEFAULT_PATHS, type BarefootPaths } from './config'
import { loadBuildConfig } from './lib/config-loader'
import { loadViteBarefootConfig } from './lib/vite-config-loader'

const thisDir = path.dirname(fileURLToPath(import.meta.url))

/**
 * Project-level config consumed by registry tooling (`bf add`,
 * `search`, `meta:extract`, etc.). Sourced from `vite.config.ts` (reading
 * the barefoot plugin's `plugin.api` — see `lib/vite-config-loader.ts`) or,
 * as a fallback while `barefoot.config.ts` still exists in a project, from
 * that legacy config file directly.
 */
export interface BarefootConfig {
  name?: string
  paths: BarefootPaths
  /**
   * Source directories that the barefoot Vite plugin (or, on the legacy
   * fallback path, `bf build`) compiles — mirrored from `vite.config.ts`'s
   * `barefoot({ components: [...] })` (or `barefoot.config.ts`'s
   * `components` array). Used by commands like `bf debug graph` to locate
   * user-authored components living outside `paths.components` — the
   * scaffold's `components/Counter.tsx` is at `components/`, not
   * `components/ui/`.
   */
  sourceDirs?: string[]
}

export interface CliContext {
  root: string       // repo root (absolute)
  metaDir: string    // ui/meta/ (absolute)
  jsonFlag: boolean  // --json flag
  /** Project config if found (null = monorepo mode). */
  config: BarefootConfig | null
  /** Directory containing the project config (absolute). */
  projectDir: string | null
}

/**
 * Search upward from startDir for the first directory containing either
 * `vite.config.ts` or `barefoot.config.ts` — `vite.config.ts` wins when a
 * directory has both (the common case today: every migrated integration
 * still carries its now-unused `barefoot.config.ts` until it's deleted).
 * Returns the directory and which config file was found there, or null.
 */
export function findProjectConfig(startDir: string): {
  dir: string
  configPath: string
  configKind: 'vite' | 'barefoot'
} | null {
  let dir = path.resolve(startDir)
  const { root: fsRoot } = path.parse(dir)
  while (true) {
    const vite = path.join(dir, 'vite.config.ts')
    if (existsSync(vite)) {
      return { dir, configPath: vite, configKind: 'vite' }
    }
    const barefoot = path.join(dir, 'barefoot.config.ts')
    if (existsSync(barefoot)) {
      return { dir, configPath: barefoot, configKind: 'barefoot' }
    }
    if (dir === fsRoot) return null
    dir = path.dirname(dir)
  }
}

// Per-cwd cache so `bf build` (which loads its own copy) and the
// surrounding command (which loads via createContext) don't transpile the
// config twice in one CLI invocation.
const buildConfigCache = new Map<string, Promise<BarefootBuildConfig>>()

/**
 * Load `barefoot.config.ts` once per absolute path in this process and
 * memoise the result. Returns the parsed `BarefootBuildConfig`.
 */
export function loadBuildConfigCached(configPath: string): Promise<BarefootBuildConfig> {
  const abs = path.resolve(configPath)
  let cached = buildConfigCache.get(abs)
  if (!cached) {
    cached = loadBuildConfig(abs)
    buildConfigCache.set(abs, cached)
  }
  return cached
}

/**
 * Build a `BarefootConfig` from `barefoot.config.ts` at `tsConfigPath`.
 * Throws on load failure — same as `loadBuildConfigCached` — so every
 * caller decides its own fallback.
 */
async function configFromBarefootConfig(tsConfigPath: string): Promise<BarefootConfig> {
  const buildConfig = await loadBuildConfigCached(tsConfigPath)
  const paths: BarefootPaths = { ...DEFAULT_PATHS, ...(buildConfig.paths ?? {}) }
  return { paths, sourceDirs: buildConfig.components }
}

/**
 * Build a `BarefootConfig` from `vite.config.ts` at `viteConfigPath`, or
 * null if that file has no barefoot plugin registered (see
 * `loadViteBarefootConfig`'s docstring — a `vite.config.ts` that exists for
 * an unrelated reason is not this project's barefoot config). Throws on
 * load failure, same contract as `configFromBarefootConfig`.
 *
 * No `paths` override exists on the Vite side (`BarefootViteOptions` has no
 * `paths` field — see PR 7a's investigation: no integration overrides
 * `paths`, and there is no root or `ui/` config either), so this always
 * uses `DEFAULT_PATHS` outright rather than merging anything in.
 */
async function configFromViteConfig(viteConfigPath: string): Promise<BarefootConfig | null> {
  const viteConfig = await loadViteBarefootConfig(viteConfigPath)
  if (!viteConfig) return null
  return { paths: { ...DEFAULT_PATHS }, sourceDirs: viteConfig.sourceDirs }
}

/**
 * Create a CliContext.
 *
 * Resolution order:
 *   1. `vite.config.ts` — read the barefoot plugin's `components` via
 *      `plugin.api` (or default `paths`).
 *   2. `barefoot.config.ts` — read `paths` (or default). Reached either
 *      when a directory has ONLY `barefoot.config.ts`, or when its
 *      `vite.config.ts` failed to load / has no barefoot plugin.
 *   3. Monorepo fallback — used when no config is present at all.
 *
 * Loading either TS config can fail in two practical situations:
 *   - dependencies are not installed yet (esbuild/Vite can't resolve
 *     `@barefootjs/hono/build` etc.)
 *   - the config has a syntax error or imports that no longer resolve
 * Setup commands need to keep working in those cases, so every step below
 * that can throw falls through to the next one instead of propagating.
 */
export async function createContext(jsonFlag: boolean): Promise<CliContext> {
  const found = findProjectConfig(process.cwd())
  const root = path.resolve(thisDir, '../../..')

  if (found) {
    if (found.configKind === 'vite') {
      try {
        const config = await configFromViteConfig(found.configPath)
        if (config) {
          const metaDir = path.resolve(found.dir, config.paths.meta)
          return { root, metaDir, jsonFlag, config, projectDir: found.dir }
        }
        // vite.config.ts exists but has no barefoot plugin — fall through
        // to a sibling barefoot.config.ts (below) exactly as if this
        // directory had no vite.config.ts at all.
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(`Warning: failed to load vite.config.ts (${msg}). Falling back.`)
      }

      const siblingBarefootConfig = path.join(found.dir, 'barefoot.config.ts')
      if (existsSync(siblingBarefootConfig)) {
        try {
          const config = await configFromBarefootConfig(siblingBarefootConfig)
          const metaDir = path.resolve(found.dir, config.paths.meta)
          return { root, metaDir, jsonFlag, config, projectDir: found.dir }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.warn(`Warning: failed to load barefoot.config.ts (${msg}). Falling back to defaults.`)
        }
      }

      const paths = { ...DEFAULT_PATHS }
      const metaDir = path.resolve(found.dir, paths.meta)
      return { root, metaDir, jsonFlag, config: { paths }, projectDir: found.dir }
    }

    // found.configKind === 'barefoot'
    try {
      const config = await configFromBarefootConfig(found.configPath)
      const metaDir = path.resolve(found.dir, config.paths.meta)
      return { root, metaDir, jsonFlag, config, projectDir: found.dir }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`Warning: failed to load barefoot.config.ts (${msg}). Falling back to defaults.`)
      const paths = { ...DEFAULT_PATHS }
      const metaDir = path.resolve(found.dir, paths.meta)
      return { root, metaDir, jsonFlag, config: { paths }, projectDir: found.dir }
    }
  }

  // Fallback: monorepo mode
  const metaDir = path.join(root, 'ui/meta')
  return { root, metaDir, jsonFlag, config: null, projectDir: null }
}
