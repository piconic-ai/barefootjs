// CLI context: shared configuration passed to every command.

import { existsSync, readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'node:url'
import type { BarefootBuildConfig } from './config'
import { DEFAULT_PATHS, type BarefootPaths } from './config'
import { loadBuildConfig } from './lib/config-loader'

const thisDir = path.dirname(fileURLToPath(import.meta.url))

/**
 * Project-level config consumed by registry tooling (`barefoot add`,
 * `search`, `meta:extract`, etc.). Source of truth is `barefoot.config.ts`;
 * legacy `barefoot.json` is loaded as a fallback during migration.
 */
export interface BarefootConfig {
  $schema?: string
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
 * Search upward from startDir for the first directory containing either
 * `barefoot.config.ts` or `barefoot.json`. The TS config takes precedence
 * when both exist in the same directory; legacy JSON-only projects keep
 * working until they run `barefoot migrate`.
 */
export function findProjectConfig(startDir: string): {
  dir: string
  tsConfigPath: string | null
  jsonConfigPath: string | null
} | null {
  let dir = path.resolve(startDir)
  const { root: fsRoot } = path.parse(dir)
  while (true) {
    const ts = path.join(dir, 'barefoot.config.ts')
    const json = path.join(dir, 'barefoot.json')
    const tsExists = existsSync(ts)
    const jsonExists = existsSync(json)
    if (tsExists || jsonExists) {
      return {
        dir,
        tsConfigPath: tsExists ? ts : null,
        jsonConfigPath: jsonExists ? json : null,
      }
    }
    if (dir === fsRoot) return null
    dir = path.dirname(dir)
  }
}

/**
 * Search upward from startDir for `barefoot.json` only.
 *
 * Retained for the migration codemod and any tool that needs to detect a
 * legacy JSON-only project. Day-to-day code should call `findProjectConfig`
 * instead, which prefers `barefoot.config.ts`.
 */
export function findBarefootJson(startDir: string): string | null {
  let dir = path.resolve(startDir)
  const { root: fsRoot } = path.parse(dir)
  while (true) {
    const candidate = path.join(dir, 'barefoot.json')
    if (existsSync(candidate)) return candidate
    if (dir === fsRoot) return null
    dir = path.dirname(dir)
  }
}

/**
 * Load and parse barefoot.json. Retained for the migration codemod; new
 * code should prefer `loadBuildConfig` to read from barefoot.config.ts.
 */
export function loadBarefootConfig(configPath: string): BarefootConfig {
  return JSON.parse(readFileSync(configPath, 'utf-8'))
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
 *   1. `barefoot.config.ts` (canonical) — read `paths` (or default).
 *   2. Legacy `barefoot.json` — kept working until the project runs
 *      `barefoot migrate`.
 *   3. Monorepo fallback — used when neither config is present.
 */
export async function createContext(jsonFlag: boolean): Promise<CliContext> {
  const found = findProjectConfig(process.cwd())
  const root = path.resolve(thisDir, '../../..')

  if (found?.tsConfigPath) {
    // Loading the TS config can fail in two practical situations:
    //   - dependencies are not installed yet (esbuild can't resolve
    //     `@barefootjs/hono/build` etc.)
    //   - the config has a syntax error or imports that no longer resolve
    // Migration / setup commands need to keep working in those cases. Fall
    // through to the JSON fallback (or to no-config mode) when load fails.
    try {
      const buildConfig = await loadBuildConfigCached(found.tsConfigPath)
      const paths: BarefootPaths = { ...DEFAULT_PATHS, ...(buildConfig.paths ?? {}) }
      const config: BarefootConfig = { paths }
      const metaDir = path.resolve(found.dir, paths.meta)
      return { root, metaDir, jsonFlag, config, projectDir: found.dir }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`Warning: failed to load barefoot.config.ts (${msg}). Falling back to defaults.`)
    }
  }

  if (found?.jsonConfigPath) {
    const config = loadBarefootConfig(found.jsonConfigPath)
    config.paths = { ...DEFAULT_PATHS, ...(config.paths ?? {}) }
    const metaDir = path.resolve(found.dir, config.paths.meta)
    return { root, metaDir, jsonFlag, config, projectDir: found.dir }
  }

  // If a TS config exists but failed to load, we still know the projectDir.
  // Surface that to commands that don't need the parsed config (e.g. `migrate`).
  if (found?.tsConfigPath) {
    const paths = { ...DEFAULT_PATHS }
    const metaDir = path.resolve(found.dir, paths.meta)
    return { root, metaDir, jsonFlag, config: { paths }, projectDir: found.dir }
  }

  // Fallback: monorepo mode
  const metaDir = path.join(root, 'ui/meta')
  return { root, metaDir, jsonFlag, config: null, projectDir: null }
}
