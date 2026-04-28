// Config loader: detect and load barefoot.config.ts

import { existsSync, unlinkSync } from 'fs'
import { dirname, resolve } from 'path'
import { pathToFileURL } from 'url'
import type { BarefootBuildConfig } from '../config'

const CONFIG_FILENAME = 'barefoot.config.ts'

/**
 * Search for barefoot.config.ts starting from the given directory.
 * Returns the absolute path if found, or null.
 */
export function findBuildConfig(startDir: string): string | null {
  const candidate = resolve(startDir, CONFIG_FILENAME)
  return existsSync(candidate) ? candidate : null
}

/**
 * Load and validate a barefoot.config.ts file.
 *
 * Bun imports .ts directly. Under Node we transpile via esbuild and write
 * a sibling .mjs so that `node_modules` resolution still walks the user's
 * project tree (a tmp-dir approach would resolve from the wrong root).
 *
 * Trade-offs of the current approach (worth revisiting later):
 *
 *   - **Cold-start cost**: spawns esbuild per `barefoot build`
 *     invocation (~100 ms). Negligible during watch mode (one-off at
 *     startup) but noticeable on cold CI builds.
 *   - **Tmp file**: writes `.barefoot.config.<pid>.mjs` next to the
 *     user's config and unlinks it in a `finally`. SIGKILL leaks the
 *     file; concurrent invocations from the same PID (rare) collide.
 *   - **Migration target**: when Node's loader API stabilises (or
 *     `tsx`'s `register` API ships with the lifecycle guarantees we
 *     need) we can register a TS-import hook for the duration of this
 *     call instead of bundling — no temp file, no esbuild spawn.
 */
export async function loadBuildConfig(configPath: string): Promise<BarefootBuildConfig> {
  const isBun = typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined'
  let importTarget = configPath
  let cleanupPath: string | null = null

  if (!isBun) {
    // Bundle the config and its TS imports (e.g. `@barefootjs/hono/build`,
    // which is published as raw .ts) into a single .mjs we can `import()`
    // under plain Node. Third-party JS packages stay external — only TS
    // sources get inlined, keeping the transitive import surface small.
    const { build } = await import('esbuild')
    importTarget = resolve(dirname(configPath), `.barefoot.config.${process.pid}.mjs`)
    await build({
      entryPoints: [configPath],
      outfile: importTarget,
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node20',
      // Bundle TS sources from @barefootjs/* (so .ts subpath exports work
      // under Node), keep everything else external so node_modules
      // resolution still happens at runtime from the user's project.
      plugins: [{
        name: 'externalize-non-barefoot',
        setup(build) {
          build.onResolve({ filter: /^[^./]/ }, (args) => {
            if (args.path.startsWith('@barefootjs/')) return null
            return { path: args.path, external: true }
          })
        },
      }],
      logLevel: 'silent',
    })
    cleanupPath = importTarget
  }

  try {
    const mod = await import(pathToFileURL(importTarget).href)
    const config = mod.default

    if (!config) {
      throw new Error(`barefoot.config.ts must have a default export`)
    }

    if (!config.adapter) {
      throw new Error(`barefoot.config.ts: "adapter" is required`)
    }

    return config as BarefootBuildConfig
  } finally {
    if (cleanupPath) {
      try { unlinkSync(cleanupPath) } catch {}
    }
  }
}
