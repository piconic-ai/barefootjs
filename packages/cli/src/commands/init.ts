// `barefoot init` — Scaffold a runnable starter app for an adapter
// (currently Hono). Counter component + server + npm scripts so the user
// can `npm install && npm run dev` and see a working page. The single
// project config is `barefoot.config.ts`, carrying both `paths` (consumed
// by registry tooling) and the build options.

import { existsSync, mkdirSync, writeFileSync } from 'fs'
import path from 'path'
import type { CliContext } from '../context'
import { addFromRegistry } from './add'
import {
  ADAPTERS,
  CSS_LIBRARIES,
  DEFAULT_ADAPTER,
  DEFAULT_CSS_LIBRARY,
  type AdapterTemplate,
} from '../lib/templates'
import { detectPackageManager, commandsFor, type PackageManager } from '../lib/pm'
import { select } from '../lib/select'

interface InitFlags {
  name?: string
  adapter?: string
  css?: string
}

function parseFlags(args: string[]): InitFlags {
  const flags: InitFlags = {}
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--name' && args[i + 1]) {
      flags.name = args[++i]
    } else if (a === '--adapter' && args[i + 1]) {
      flags.adapter = args[++i]
    } else if (a === '--css' && args[i + 1]) {
      flags.css = args[++i]
    }
  }
  return flags
}

export async function run(args: string[], ctx: CliContext): Promise<void> {
  const projectDir = process.cwd()
  const flags = parseFlags(args)

  const tsConfigPath = path.join(projectDir, 'barefoot.config.ts')
  if (existsSync(tsConfigPath)) {
    console.error('Error: barefoot.config.ts already exists. Project is already initialized.')
    process.exit(1)
  }

  const adapterId = await resolveAdapter(flags.adapter)
  const adapter = ADAPTERS[adapterId]
  const cssId = await resolveCssLibrary(flags.css)
  const cssLibrary = CSS_LIBRARIES[cssId]
  console.log(`  Adapter:     ${adapter.label}`)
  console.log(`  CSS library: ${cssLibrary.label}`)
  console.log()

  // Pre-flight: confirm the UI registry is reachable BEFORE writing
  // anything to disk. The runnable starter requires the registry's
  // Button component, and a vanilla fallback would force the user
  // through a painful migration to UnoCSS + barefootjs UI later.
  // Better to fail fast and have them retry online with no partial
  // state to clean up.
  try {
    await probeRegistry(DEFAULT_REGISTRY_URL)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`Error: cannot reach the BarefootJS UI registry at ${DEFAULT_REGISTRY_URL}`)
    console.error(`  ${msg}`)
    console.error(``)
    console.error(`barefoot init needs the registry to scaffold a runnable starter (Counter`)
    console.error(`uses Button from the registry, which the renderer wires through UnoCSS).`)
    console.error(`Retry when online.`)
    process.exit(1)
  }

  const warnings = adapter.prereqWarnings()
  for (const w of warnings) console.warn(`  ! ${w}`)

  console.log(`Initializing BarefootJS app...\n`)

  await scaffoldApp(projectDir, adapter, flags, ctx)
  printAppNextSteps(projectDir, adapter)
}

// Resolve the adapter by precedence: explicit `--adapter` flag (validated)
// > interactive selector when stdin is a TTY and 2+ adapters are
// registered > the registry default. The selector itself short-circuits
// to the default in single-option / non-TTY scenarios (see select.ts),
// so callers don't need to special-case those.
async function resolveAdapter(flag: string | undefined): Promise<string> {
  if (flag) {
    if (!ADAPTERS[flag]) {
      const known = Object.keys(ADAPTERS).join(', ')
      console.error(`Error: unknown adapter "${flag}". Available: ${known}`)
      process.exit(1)
    }
    return flag
  }
  const options = Object.entries(ADAPTERS).map(([value, t]) => ({ value, label: t.label }))
  try {
    return await select({ message: 'Choose an adapter:', options, defaultValue: DEFAULT_ADAPTER })
  } catch {
    process.exit(1)
  }
}

async function resolveCssLibrary(flag: string | undefined): Promise<string> {
  if (flag) {
    if (!CSS_LIBRARIES[flag]) {
      const known = Object.keys(CSS_LIBRARIES).join(', ')
      console.error(`Error: unknown CSS library "${flag}". Available: ${known}`)
      process.exit(1)
    }
    return flag
  }
  const options = Object.entries(CSS_LIBRARIES).map(([value, t]) => ({ value, label: t.label }))
  try {
    return await select({ message: 'Choose a CSS library:', options, defaultValue: DEFAULT_CSS_LIBRARY })
  } catch {
    process.exit(1)
  }
}

async function probeRegistry(url: string): Promise<void> {
  const probeUrl = `${url.replace(/\/$/, '')}/button.json`
  const res = await fetch(probeUrl, {
    method: 'HEAD',
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
}

async function scaffoldApp(
  projectDir: string,
  adapter: AdapterTemplate,
  flags: InitFlags,
  _ctx: CliContext,
): Promise<void> {
  // The single source of truth is `barefoot.config.ts` (written below via
  // adapter.files). It carries both `paths` (consumed by registry tooling)
  // and the build options. We mirror the same defaults here so the rest
  // of init can reason about layout without re-loading the TS file.
  const paths = {
    components: 'components/ui',
    tokens: 'tokens',
    meta: 'meta',
  }

  // Adapter-contributed files (server, components/Counter, barefoot.config.ts, etc.)
  for (const [relPath, contents] of Object.entries(adapter.files)) {
    const target = path.join(projectDir, relPath)
    if (existsSync(target)) {
      console.log(`  Skipped ${relPath} (already exists)`)
      continue
    }
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, contents)
    console.log(`  Created ${relPath}`)
  }

  // meta/ — empty registry index so `barefoot search` doesn't error
  // on an unconfigured app.
  const metaDir = path.resolve(projectDir, paths.meta)
  mkdirSync(metaDir, { recursive: true })
  writeFileSync(
    path.join(metaDir, 'index.json'),
    JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), components: [] }, null, 2) + '\n',
  )
  console.log(`  Created ${paths.meta}/index.json`)

  // package.json — merge adapter scripts/deps with a sensible default.
  const pkgJsonPath = path.join(projectDir, 'package.json')
  const pkgName = flags.name || path.basename(projectDir).replace(/[^a-z0-9-_]/gi, '-').toLowerCase() || 'barefoot-app'
  const pkgJson = {
    name: pkgName,
    private: true,
    type: 'module',
    scripts: {
      ...adapter.scripts,
      test: 'echo "no tests yet"',
    },
    dependencies: { ...adapter.dependencies },
    devDependencies: { ...adapter.devDependencies },
  }
  if (existsSync(pkgJsonPath)) {
    console.log('  Skipped package.json (already exists — merge deps manually)')
  } else {
    writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + '\n')
    console.log('  Created package.json')
  }

  // Pull the registry Button. The pre-flight probe in run() already
  // verified reachability, so a failure here is unusual (transient
  // registry hiccup, malformed item, etc.) — let it propagate so the
  // user retries instead of ending up with a half-scaffolded project
  // that points at a missing import.
  await addFromRegistry(['button'], DEFAULT_REGISTRY_URL, projectDir, { paths }, true, true)
}

const DEFAULT_REGISTRY_URL = 'https://ui.barefootjs.dev/r/'

function printAppNextSteps(projectDir: string, adapter: AdapterTemplate): void {
  const pm: PackageManager = detectPackageManager(projectDir)
  const cmd = commandsFor(pm)
  console.log(`\nProject initialized!  (detected package manager: ${pm})`)
  console.log(`\nNext steps:`)
  console.log(`  1. Install dependencies`)
  console.log(`       ${cmd.install}`)
  console.log(`  2. Start the dev server`)
  console.log(`       ${cmd.run('dev')}`)
  console.log(`       → http://localhost:${adapter.port}`)
  console.log(``)
  console.log(`Then try:`)
  console.log(`  • Edit components/Counter.tsx — the page rebuilds and reloads automatically.`)
  console.log(`  • Inspect the bundled Button:    ${cmd.exec('barefoot ui button')}`)
  console.log(`  • Browse the component registry: ${cmd.exec('barefoot search <query>')}`)
  console.log(`  • Add another component:         ${cmd.exec('barefoot add input')}`)
}
