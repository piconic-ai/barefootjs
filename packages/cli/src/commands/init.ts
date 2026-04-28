// `barefoot init` — Initialize a new BarefootJS project.
//
// Two modes:
//
//   1. Default (app mode): scaffold a runnable starter app for an adapter
//      (currently Hono). Counter component + server + npm scripts so the
//      user can `npm install && npm run dev` and see a working page.
//
//   2. --registry-only: scaffold just the component-registry directory
//      layout (barefoot.json + tokens/ + meta/ + components/ui/), without
//      a server. Useful for projects that only consume `barefoot add`.

import { existsSync, mkdirSync, writeFileSync, copyFileSync, readFileSync } from 'fs'
import path from 'path'
import type { CliContext } from '../context'
import type { BarefootConfig } from '../context'
import { addFromRegistry } from './add'
import { ADAPTERS, DEFAULT_ADAPTER, type AdapterTemplate } from '../lib/templates'
import { detectPackageManager, commandsFor, type PackageManager } from '../lib/pm'

const DEFAULT_CONFIG: BarefootConfig = {
  $schema: 'https://barefootjs.dev/schema/barefoot.json',
  paths: {
    components: 'components/ui',
    tokens: 'tokens',
    meta: 'meta',
  },
}

interface InitFlags {
  name?: string
  fromUrl?: string
  adapter: string
  registryOnly: boolean
}

function parseFlags(args: string[]): InitFlags {
  const flags: InitFlags = {
    adapter: DEFAULT_ADAPTER,
    registryOnly: false,
  }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--name' && args[i + 1]) {
      flags.name = args[++i]
    } else if (a === '--from' && args[i + 1]) {
      flags.fromUrl = args[++i]
    } else if (a === '--adapter' && args[i + 1]) {
      flags.adapter = args[++i]
    } else if (a === '--registry-only') {
      flags.registryOnly = true
    }
  }
  return flags
}

export async function run(args: string[], ctx: CliContext): Promise<void> {
  const projectDir = process.cwd()
  const flags = parseFlags(args)

  // Check if already initialized
  const configPath = path.join(projectDir, 'barefoot.json')
  if (existsSync(configPath)) {
    console.error('Error: barefoot.json already exists. Project is already initialized.')
    process.exit(1)
  }

  if (flags.registryOnly) {
    await runRegistryOnly(projectDir, configPath, flags, ctx)
    return
  }

  const adapter = ADAPTERS[flags.adapter]
  if (!adapter) {
    const known = Object.keys(ADAPTERS).join(', ')
    console.error(`Error: unknown adapter "${flags.adapter}". Available: ${known}`)
    console.error(`(Other backends — Echo, Mojolicious — are showcased in the docs but not yet wired into init.)`)
    process.exit(1)
  }

  const warnings = adapter.prereqWarnings()
  for (const w of warnings) console.warn(`  ! ${w}`)

  console.log(`Initializing BarefootJS app with the ${adapter.label} adapter...\n`)

  await scaffoldApp(projectDir, configPath, adapter, flags, ctx)
  printAppNextSteps(projectDir, adapter)
}

async function runRegistryOnly(
  projectDir: string,
  configPath: string,
  flags: InitFlags,
  ctx: CliContext,
): Promise<void> {
  const config: BarefootConfig = { ...DEFAULT_CONFIG }
  if (flags.name) config.name = flags.name

  // 1. Write barefoot.json
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n')
  console.log('  Created barefoot.json')

  // 2. Generate tokens/ (tokens.json + tokens.css)
  const tokensDir = path.resolve(projectDir, config.paths.tokens)
  mkdirSync(tokensDir, { recursive: true })

  const sourceTokensJson = path.resolve(ctx.root, 'site/shared/tokens/tokens.json')
  const destTokensJson = path.join(tokensDir, 'tokens.json')
  if (existsSync(sourceTokensJson)) {
    copyFileSync(sourceTokensJson, destTokensJson)
    console.log(`  Created ${config.paths.tokens}/tokens.json`)
  }

  // Apply token overrides from Studio URL if provided
  let studioConfig: StudioConfig | undefined
  if (flags.fromUrl) {
    studioConfig = parseStudioUrl(flags.fromUrl)
    if (studioConfig && existsSync(destTokensJson)) {
      applyTokenOverrides(destTokensJson, studioConfig)
      console.log(`  Applied Studio token overrides`)
    }
  }

  // Generate tokens.css from tokens.json
  await generateTokensCSS(ctx.root, destTokensJson, tokensDir, config.paths.tokens)

  // Append CSS variable overrides not in tokens.json (e.g., --spacing from Tailwind)
  if (studioConfig) {
    appendCSSOverrides(path.join(tokensDir, 'tokens.css'), studioConfig)
  }

  // 3. Copy types/index.tsx
  const typesDir = path.join(projectDir, 'types')
  mkdirSync(typesDir, { recursive: true })
  const sourceTypes = path.resolve(ctx.root, 'ui/types/index.tsx')
  if (existsSync(sourceTypes)) {
    copyFileSync(sourceTypes, path.join(typesDir, 'index.tsx'))
    console.log('  Created types/index.tsx')
  }

  // 4. Create meta/ directory
  const metaDir = path.resolve(projectDir, config.paths.meta)
  mkdirSync(metaDir, { recursive: true })
  writeFileSync(
    path.join(metaDir, 'index.json'),
    JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), components: [] }, null, 2) + '\n',
  )
  console.log(`  Created ${config.paths.meta}/index.json`)

  // 5. Create components directory
  const componentsDir = path.resolve(projectDir, config.paths.components)
  mkdirSync(componentsDir, { recursive: true })

  // 6. Generate package.json if it doesn't exist
  const pkgJsonPath = path.join(projectDir, 'package.json')
  if (!existsSync(pkgJsonPath)) {
    const pkgJson = {
      name: flags.name || 'my-design-system',
      private: true,
      type: 'module',
      scripts: {
        test: 'bun test',
      },
      dependencies: {
        '@barefootjs/client': 'workspace:*',
        '@barefootjs/jsx': 'workspace:*',
      },
      devDependencies: {
        '@barefootjs/test': 'workspace:*',
      },
    }
    writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + '\n')
    console.log('  Created package.json')
  }

  // 7. Generate tsconfig.json if it doesn't exist
  const tsconfigPath = path.join(projectDir, 'tsconfig.json')
  if (!existsSync(tsconfigPath)) {
    const tsconfig = {
      compilerOptions: {
        target: 'ESNext',
        module: 'ESNext',
        moduleResolution: 'bundler',
        jsx: 'react-jsx',
        jsxImportSource: '@barefootjs/jsx',
        strict: true,
        skipLibCheck: true,
        noEmit: true,
        types: ['bun-types'],
      },
      include: ['**/*.ts', '**/*.tsx'],
      exclude: ['node_modules', 'dist'],
    }
    writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2) + '\n')
    console.log('  Created tsconfig.json')
  }

  // 8. If --from was provided, fetch all components from the registry
  if (flags.fromUrl) {
    const registryUrl = deriveRegistryUrl(flags.fromUrl)
    console.log(`\n  Fetching components from ${registryUrl}...`)
    try {
      // Use registry.json (build-registry output) instead of index.json (meta output)
      // to only fetch components that have actual RegistryItem files.
      const registryJsonUrl = registryUrl.endsWith('/') ? `${registryUrl}registry.json` : `${registryUrl}/registry.json`
      const res = await fetch(registryJsonUrl, { signal: AbortSignal.timeout(10_000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const registry = await res.json() as { items: { name: string }[] }
      const allNames = registry.items.map(i => i.name)
      if (allNames.length > 0) {
        await addFromRegistry(allNames, registryUrl, projectDir, config, true, true)
      }
    } catch (err) {
      console.log(`  Skipped component download: ${err instanceof Error ? err.message : err}`)
      console.log(`  Run \`barefoot add <component...> --registry ${deriveRegistryUrl(flags.fromUrl)}\` to add components later.`)
    }
  }

  const pm = detectPackageManager(projectDir)
  const cmd = commandsFor(pm)
  console.log(`\nProject initialized successfully!`)
  console.log(`\nNext steps:`)
  console.log(`  ${cmd.install}`)
  if (!flags.fromUrl) {
    console.log(`  ${cmd.exec('barefoot add button checkbox')}`)
  }
  console.log(`  ${cmd.run('test')}`)
  console.log(`  ${cmd.exec('barefoot search <query>')}`)
}

// ── App scaffolding (default mode) ──

async function scaffoldApp(
  projectDir: string,
  configPath: string,
  adapter: AdapterTemplate,
  flags: InitFlags,
  _ctx: CliContext,
): Promise<void> {
  // 1. barefoot.json — components live next to server.tsx by default for
  //    apps. The registry-only mode keeps the original `components/ui`
  //    convention; here we use plain `components/` so user code and
  //    `barefoot add` output coexist cleanly (barefoot add lands in
  //    `components/ui/` per the path config).
  const config: BarefootConfig = {
    $schema: DEFAULT_CONFIG.$schema,
    paths: {
      components: 'components/ui',
      tokens: 'tokens',
      meta: 'meta',
    },
  }
  if (flags.name) config.name = flags.name
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n')
  console.log('  Created barefoot.json')

  // 2. Adapter-contributed files (server, components/Counter, etc.)
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

  // 3. meta/ — empty registry index so `barefoot search` doesn't error
  //    on an unconfigured app.
  const metaDir = path.resolve(projectDir, config.paths.meta)
  mkdirSync(metaDir, { recursive: true })
  writeFileSync(
    path.join(metaDir, 'index.json'),
    JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), components: [] }, null, 2) + '\n',
  )
  console.log(`  Created ${config.paths.meta}/index.json`)

  // 4. package.json — merge adapter scripts/deps with a sensible default.
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
}

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
  console.log(`  • Edit components/Counter.tsx — saves rebuild and reload the page.`)
  console.log(`  • Inspect the bundled <Button>:  ${cmd.exec('barefoot ui button')}`)
  console.log(`  • Find more components:        ${cmd.exec('barefoot search <query>')}`)
  console.log(`  • Add a component to ui/:      ${cmd.exec('barefoot add <name>')}`)
}

// ── Studio URL parsing ──

export interface StudioConfig {
  style?: string
  tokens?: Record<string, { light?: string; dark?: string }>
  spacing?: string
  radius?: string
  font?: string
}

export function parseStudioUrl(url: string): StudioConfig | undefined {
  try {
    const parsed = new URL(url)
    const encoded = parsed.searchParams.get('c')
    if (!encoded) return undefined
    const json = atob(decodeURIComponent(encoded))
    return JSON.parse(json)
  } catch {
    console.error('Warning: Could not parse Studio URL config. Using defaults.')
    return undefined
  }
}

export function deriveRegistryUrl(studioUrl: string): string {
  try {
    const parsed = new URL(studioUrl)
    return `${parsed.origin}/r/`
  } catch {
    return 'https://ui.barefootjs.dev/r/'
  }
}

// ── Token override logic ──

export function applyTokenOverrides(tokensJsonPath: string, config: StudioConfig): void {
  const raw = readFileSync(tokensJsonPath, 'utf-8')
  const tokensData = JSON.parse(raw)

  // Apply color token overrides
  if (config.tokens) {
    for (const [name, values] of Object.entries(config.tokens)) {
      applyColorOverride(tokensData, name, values)
    }
  }

  // Apply spacing override
  if (config.spacing) {
    applySimpleOverride(tokensData, '--spacing', config.spacing)
  }

  // Apply radius override
  if (config.radius) {
    applySimpleOverride(tokensData, '--radius', config.radius)
  }

  // Apply font override
  if (config.font) {
    // Font key → font-family value mapping (same as Studio)
    const fontMap: Record<string, string> = {
      system: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif',
      inter: '"Inter", sans-serif',
      'noto-sans': '"Noto Sans", sans-serif',
      'nunito-sans': '"Nunito Sans", sans-serif',
      figtree: '"Figtree", sans-serif',
    }
    const fontValue = fontMap[config.font] || config.font
    applySimpleOverride(tokensData, '--font-sans', fontValue)
  }

  // Apply shadow overrides from style preset
  if (config.style) {
    applyShadowPreset(tokensData, config.style)
  }

  writeFileSync(tokensJsonPath, JSON.stringify(tokensData, null, 2) + '\n')
}

function applyColorOverride(
  tokensData: any,
  name: string,
  values: { light?: string; dark?: string },
): void {
  // Walk tokens looking for matching CSS variable name
  const varName = `--${name}`
  if (Array.isArray(tokensData.colors)) {
    for (const token of tokensData.colors) {
      if (token.name === varName || token.name === name) {
        if (values.light) token.value = values.light
        if (values.dark) token.dark = values.dark
        return
      }
    }
  }
  // Fallback: walk all tokens
  if (Array.isArray(tokensData.tokens)) {
    for (const token of tokensData.tokens) {
      if (token.name === varName || token.name === name) {
        if (values.light) token.value = values.light
        if (values.dark) token.dark = values.dark
        return
      }
    }
  }
}

function applySimpleOverride(tokensData: any, name: string, value: string): void {
  // Strip leading -- for matching (tokens.json uses bare names like "radius", not "--radius")
  const bareName = name.startsWith('--') ? name.slice(2) : name

  // Walk all array-valued sections in tokens.json
  const sections = [
    tokensData.colors, tokensData.spacing, tokensData.borderRadius,
    tokensData.shadows, tokensData.layout,
  ]
  // Also walk nested objects (typography.fontFamily, typography.letterSpacing, etc.)
  if (tokensData.typography) {
    for (const arr of Object.values(tokensData.typography)) {
      if (Array.isArray(arr)) sections.push(arr as any[])
    }
  }

  for (const arr of sections) {
    if (!Array.isArray(arr)) continue
    for (const token of arr) {
      if (token.name === bareName || token.name === name) {
        token.value = value
        return
      }
    }
  }
}

function applyShadowPreset(tokensData: any, styleName: string): void {
  // Style presets (must match Studio's stylePresets)
  // Use bare names (no -- prefix) to match tokens.json schema
  const presets: Record<string, Record<string, string>> = {
    Sharp: {
      'shadow-sm': '0 1px 2px 0 rgb(0 0 0 / 0.04)',
      'shadow': '0 1px 2px 0 rgb(0 0 0 / 0.06)',
      'shadow-md': '0 2px 4px -1px rgb(0 0 0 / 0.08)',
      'shadow-lg': '0 4px 8px -2px rgb(0 0 0 / 0.1)',
    },
    Soft: {
      'shadow-sm': '0 1px 3px 0 rgb(0 0 0 / 0.06)',
      'shadow': '0 2px 6px 0 rgb(0 0 0 / 0.08), 0 1px 3px -1px rgb(0 0 0 / 0.06)',
      'shadow-md': '0 6px 12px -2px rgb(0 0 0 / 0.08), 0 3px 6px -3px rgb(0 0 0 / 0.06)',
      'shadow-lg': '0 12px 24px -4px rgb(0 0 0 / 0.08), 0 6px 10px -5px rgb(0 0 0 / 0.06)',
    },
    Compact: {
      'shadow-sm': 'none',
      'shadow': 'none',
      'shadow-md': 'none',
      'shadow-lg': '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    },
  }

  const shadows = presets[styleName]
  if (!shadows) return

  for (const [name, value] of Object.entries(shadows)) {
    applySimpleOverride(tokensData, name, value)
  }
}

/**
 * Append CSS variable overrides that aren't part of tokens.json
 * (e.g., --spacing is a Tailwind v4 variable, not in our token schema).
 */
export function appendCSSOverrides(cssPath: string, config: StudioConfig): void {
  if (!existsSync(cssPath)) return

  const lines: string[] = []
  if (config.spacing) {
    lines.push(`  --spacing: ${config.spacing};`)
  }

  if (lines.length === 0) return

  const existing = readFileSync(cssPath, 'utf-8')
  // Insert overrides into the :root block before the closing }
  const rootCloseIdx = existing.indexOf('}')
  if (rootCloseIdx === -1) return

  const patched = existing.slice(0, rootCloseIdx) +
    `\n  /* ── Studio overrides ── */\n${lines.join('\n')}\n` +
    existing.slice(rootCloseIdx)

  writeFileSync(cssPath, patched)
}

async function generateTokensCSS(
  root: string,
  tokensJsonPath: string,
  tokensDir: string,
  tokensRelDir: string,
): Promise<void> {
  try {
    const { loadTokens, generateCSS } = await import(
      path.resolve(root, 'site/shared/tokens/index')
    )
    const tokenSet = await loadTokens(tokensJsonPath)
    const css = generateCSS(tokenSet)
    writeFileSync(path.join(tokensDir, 'tokens.css'), css)
    console.log(`  Created ${tokensRelDir}/tokens.css`)
  } catch {
    // Token generation is optional; skip if modules are not available
    console.log(`  Skipped tokens.css generation (token modules not available)`)
  }
}
