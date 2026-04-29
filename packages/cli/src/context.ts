// CLI context: shared configuration passed to every command.

import { existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'node:url'
import type { BarefootBuildConfig } from './config'
import { DEFAULT_PATHS, type BarefootPaths } from './config'
import { loadBuildConfig } from './lib/config-loader'

const thisDir = path.dirname(fileURLToPath(import.meta.url))

/**
 * Project-level config consumed by registry tooling (`barefoot add`,
 * `search`, `meta:extract`, etc.). Sourced from `barefoot.config.ts`.
 */
export interface BarefootConfig {
  name?: string
  paths: BarefootPaths
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
 * `barefoot.config.ts`. Returns the directory and config path, or null.
 */
export function findProjectConfig(startDir: string): {
  dir: string
  tsConfigPath: string
} | null {
  let dir = path.resolve(startDir)
  const { root: fsRoot } = path.parse(dir)
  while (true) {
    const ts = path.join(dir, 'barefoot.config.ts')
    if (existsSync(ts)) {
      return { dir, tsConfigPath: ts }
    }
    if (dir === fsRoot) return null
    dir = path.dirname(dir)
  }
}

// Per-cwd cache so `barefoot build` (which loads its own copy) and the
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
 * Create a CliContext.
 *
 * Resolution order:
 *   1. `barefoot.config.ts` — read `paths` (or default).
 *   2. Monorepo fallback — used when no config is present.
 */
export async function createContext(jsonFlag: boolean): Promise<CliContext> {
  const found = findProjectConfig(process.cwd())
  const root = path.resolve(thisDir, '../../..')

  if (found) {
    // Loading the TS config can fail in two practical situations:
    //   - dependencies are not installed yet (esbuild can't resolve
    //     `@barefootjs/hono/build` etc.)
    //   - the config has a syntax error or imports that no longer resolve
    // Setup commands need to keep working in those cases. Fall through to
    // defaults when load fails so commands that don't need the parsed
    // config still know the project root.
    try {
      const buildConfig = await loadBuildConfigCached(found.tsConfigPath)
      const paths: BarefootPaths = { ...DEFAULT_PATHS, ...(buildConfig.paths ?? {}) }
      const config: BarefootConfig = { paths }
      const metaDir = path.resolve(found.dir, paths.meta)
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
