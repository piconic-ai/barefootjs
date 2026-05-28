// bf preview — compile a component's previews to a CSR bundle.
//
// Tokens, globals.css, the UnoCSS config and the client runtime are
// resolved per-environment (user project → monorepo → CLI-bundled
// defaults) in lib/preview/assets.ts, so this runs both inside the
// monorepo and in an end-user project under Node.

import { existsSync, readdirSync, watch as fsWatch } from 'fs'
import path from 'path'
import type { CliContext } from '../context'
import { resolveScaffoldLayout } from '../lib/scaffold-layout'
import { runPreview, PreviewError } from '../lib/preview/run'
import { startPreviewServer } from '../lib/preview/serve'

const DEFAULT_PORT = 4321

const HELP = `Usage: bf preview [component] [options]

  bf preview                 List previewable components
  bf preview <component>     Build a static preview into .preview-dist/

Options:
  --serve            Serve the build on a local server and print its URL
  --watch            Rebuild on source changes and live-reload (implies --serve)
  --port <number>    Server port for --serve/--watch (default ${DEFAULT_PORT})
  -h, --help         Show this help`

interface PreviewArgs {
  component?: string
  serve: boolean
  watch: boolean
  help: boolean
  port: number
}

function parseArgs(args: string[]): PreviewArgs {
  const out: PreviewArgs = { serve: false, watch: false, help: false, port: DEFAULT_PORT }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '-h' || a === '--help') out.help = true
    else if (a === '--serve') out.serve = true
    else if (a === '--watch') out.watch = true
    else if (a === '--port') out.port = parseInt(args[++i] ?? '', 10)
    else if (a.startsWith('--port=')) out.port = parseInt(a.slice('--port='.length), 10)
    else if (!a.startsWith('-') && out.component === undefined) out.component = a
  }
  if (out.watch) out.serve = true
  return out
}

function listPreviewableComponents(ctx: CliContext): string[] {
  // Mirror `bf gen preview`'s write location so the lister and the
  // generator agree on where previews live.
  const { writeRoot, componentsBasePath } = resolveScaffoldLayout(ctx)
  const componentsDir = path.join(writeRoot, componentsBasePath)
  if (!existsSync(componentsDir)) return []
  const names: string[] = []
  for (const name of readdirSync(componentsDir)) {
    const previewFile = path.join(componentsDir, name, 'index.preview.tsx')
    if (existsSync(previewFile)) names.push(name)
  }
  return names.sort()
}

export async function run(args: string[], ctx: CliContext): Promise<void> {
  const opts = parseArgs(args)

  if (opts.help) {
    console.log(HELP)
    return
  }

  if (!opts.component) {
    const available = listPreviewableComponents(ctx)
    if (ctx.jsonFlag) {
      console.log(JSON.stringify({ previewable: available }, null, 2))
      return
    }
    if (available.length === 0) {
      console.error('No previewable components found.')
      console.error('Generate one with: bf gen preview <component>')
      process.exit(1)
    }
    console.log(`${available.length} previewable component(s):`)
    for (const name of available) console.log(`  ${name}`)
    console.log()
    console.log('Open one with: bf preview <component>')
    return
  }

  if (!Number.isInteger(opts.port) || opts.port < 1 || opts.port > 65535) {
    console.error(`Invalid --port: must be an integer between 1 and 65535.`)
    process.exit(1)
  }

  const component = opts.component
  const runOpts = { liveReload: opts.watch }

  let result
  try {
    result = await runPreview(component, ctx, runOpts)
  } catch (err) {
    if (err instanceof PreviewError) {
      console.error(`Error: ${err.message}`)
      process.exit(1)
    }
    throw err
  }

  const relDir = path.relative(process.cwd(), result.distDir)
  console.log(`\n✓ Preview built → ${relDir}/`)

  if (!opts.serve) {
    console.log(`\n  npx serve ${relDir}`)
    return
  }

  const server = startPreviewServer(result.distDir, opts.port)
  console.log(`\n  Serving ${server.url}`)

  if (!opts.watch) {
    console.log('  Press Ctrl+C to stop.')
    await new Promise<void>(resolve => process.on('SIGINT', resolve))
    server.close()
    return
  }

  // Watch mode: rebuild the scoped closure on source changes, then bump
  // the reload token so open pages refresh.
  console.log('  Watching for changes — edit a component and save. Press Ctrl+C to stop.')

  let rebuilding = false
  let pending = false
  let timer: NodeJS.Timeout | undefined

  const rebuild = async () => {
    if (rebuilding) {
      pending = true
      return
    }
    rebuilding = true
    console.log('\nChange detected — rebuilding...')
    try {
      await runPreview(component, ctx, runOpts)
      server.bumpReload()
      console.log('✓ Rebuilt')
    } catch (err) {
      const msg = err instanceof PreviewError ? err.message : (err as Error).message
      console.error(`✗ Rebuild failed: ${msg}`)
    } finally {
      rebuilding = false
      if (pending) {
        pending = false
        void rebuild()
      }
    }
  }

  const schedule = () => {
    clearTimeout(timer)
    timer = setTimeout(() => void rebuild(), 150)
  }

  const { writeRoot, componentsBasePath } = resolveScaffoldLayout(ctx)
  const watchTargets = [
    path.join(writeRoot, componentsBasePath),
    // Monorepo token/CSS sources
    path.join(ctx.root, 'site/ui/styles'),
    path.join(ctx.root, 'site/ui/tokens.json'),
    path.join(ctx.root, 'site/shared/tokens'),
    // Project token/CSS sources
    ctx.projectDir && path.join(ctx.projectDir, 'styles'),
    ctx.projectDir && path.join(ctx.projectDir, 'globals.css'),
    ctx.projectDir && path.join(ctx.projectDir, 'uno.config.ts'),
    ctx.projectDir && ctx.config?.paths.tokens
      && path.join(ctx.projectDir, ctx.config.paths.tokens),
  ].filter((t): t is string => !!t && existsSync(t))

  const watchers = watchTargets.map(target =>
    fsWatch(target, { recursive: true }, schedule),
  )

  await new Promise<void>(resolve => process.on('SIGINT', resolve))
  for (const w of watchers) w.close()
  server.close()
}
