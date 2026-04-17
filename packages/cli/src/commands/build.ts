// `barefoot build` — Compile JSX components using barefoot.config.ts.

import type { CliContext } from '../context'
import { resolveBuildConfigFromTs, build, watch } from '../lib/build'
import { findBuildConfig, loadBuildConfig } from '../lib/config-loader'

export async function run(args: string[], ctx: CliContext): Promise<void> {
  const projectDir = ctx.projectDir ?? process.cwd()

  const tsConfigPath = findBuildConfig(projectDir)
  if (!tsConfigPath) {
    console.error('Error: barefoot.config.ts not found.')
    console.error('Create one:')
    console.error('  import { createConfig } from "@barefootjs/hono/build"')
    console.error('  export default createConfig({ components: ["components"] })')
    process.exit(1)
  }

  const tsConfig = await loadBuildConfig(tsConfigPath)
  const overrides: { minify?: boolean } = {}
  if (args.includes('--minify')) overrides.minify = true
  const config = resolveBuildConfigFromTs(projectDir, tsConfig, overrides)

  const force = args.includes('--force')
  const watchMode = args.includes('--watch')

  console.log(`Adapter: ${config.adapter.name}`)
  console.log(`Source dirs: ${config.componentDirs.join(', ')}`)
  console.log(`Output dir: ${config.outDir}`)
  if (watchMode) console.log('Mode: watch')
  if (force) console.log('Force: cache ignored')
  console.log('')

  if (watchMode) {
    const controller = new AbortController()
    const stop = () => controller.abort()
    process.on('SIGINT', stop)
    process.on('SIGTERM', stop)
    try {
      await watch(config, { signal: controller.signal })
    } finally {
      process.off('SIGINT', stop)
      process.off('SIGTERM', stop)
    }
    return
  }

  const result = await build(config, { force })

  console.log('')
  console.log(
    `Build complete: ${result.compiledCount} compiled, ${result.cachedCount} cached, ${result.skippedCount} skipped, ${result.errorCount} errors`,
  )

  if (result.errorCount > 0) {
    process.exit(1)
  }
}
