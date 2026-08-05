// CLI context: shared configuration passed to every command.

import { existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_PATHS, type BarefootPaths } from './config'
import { loadViteBarefootConfig } from './lib/vite-config-loader'

const thisDir = path.dirname(fileURLToPath(import.meta.url))

/**
 * Project-level config consumed by registry tooling (`bf add`,
 * `search`, `meta:extract`, etc.). Sourced from `vite.config.ts` — reading
 * the barefoot plugin's `plugin.api` — see `lib/vite-config-loader.ts`.
 */
export interface BarefootConfig {
  name?: string
  paths: BarefootPaths
  /**
   * Source directories the barefoot Vite plugin compiles — mirrored from
   * `vite.config.ts`'s `barefoot({ components: [...] })`. Used by commands
   * like `bf debug graph` to locate user-authored components living
   * outside `paths.components` — the scaffold's `components/Counter.tsx`
   * is at `components/`, not `components/ui/`.
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
 * Search upward from startDir for the first directory containing
 * `vite.config.ts`. Returns the directory and config path, or null.
 */
export function findProjectConfig(startDir: string): {
  dir: string
  configPath: string
} | null {
  let dir = path.resolve(startDir)
  const { root: fsRoot } = path.parse(dir)
  while (true) {
    const vite = path.join(dir, 'vite.config.ts')
    if (existsSync(vite)) {
      return { dir, configPath: vite }
    }
    if (dir === fsRoot) return null
    dir = path.dirname(dir)
  }
}

/**
 * Build a `BarefootConfig` from `vite.config.ts` at `viteConfigPath`, or
 * null if that file has no barefoot plugin registered (see
 * `loadViteBarefootConfig`'s docstring — a `vite.config.ts` that exists for
 * an unrelated reason is not this project's barefoot config). Throws on
 * load failure.
 *
 * No `paths` override exists on the Vite side (`BarefootViteOptions` has no
 * `paths` field), so this always uses `DEFAULT_PATHS` outright rather than
 * merging anything in.
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
 *   2. Monorepo fallback — used when no config is present, or the found
 *      `vite.config.ts` has no barefoot plugin registered.
 *
 * Loading `vite.config.ts` can fail in two practical situations:
 *   - dependencies are not installed yet (Vite can't resolve
 *     `@barefootjs/vite` etc.)
 *   - the config has a syntax error or imports that no longer resolve
 * Setup commands need to keep working in those cases, so a load failure
 * falls through to the monorepo default rather than propagating.
 */
export async function createContext(jsonFlag: boolean): Promise<CliContext> {
  const found = findProjectConfig(process.cwd())
  const root = path.resolve(thisDir, '../../..')

  if (found) {
    try {
      const config = await configFromViteConfig(found.configPath)
      if (config) {
        const metaDir = path.resolve(found.dir, config.paths.meta)
        return { root, metaDir, jsonFlag, config, projectDir: found.dir }
      }
      // vite.config.ts exists but has no barefoot plugin — fall through to
      // defaults exactly as if this directory had no vite.config.ts at all.
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`Warning: failed to load vite.config.ts (${msg}). Falling back.`)
    }

    const paths = { ...DEFAULT_PATHS }
    const metaDir = path.resolve(found.dir, paths.meta)
    return { root, metaDir, jsonFlag, config: { paths }, projectDir: found.dir }
  }

  // Fallback: monorepo mode
  const metaDir = path.join(root, 'ui/meta')
  return { root, metaDir, jsonFlag, config: null, projectDir: null }
}
