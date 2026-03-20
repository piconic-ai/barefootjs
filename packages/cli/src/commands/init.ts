// `barefoot init` — Initialize a new BarefootJS project.

import { existsSync, mkdirSync, writeFileSync, copyFileSync, readFileSync } from 'fs'
import path from 'path'
import type { CliContext } from '../context'
import type { BarefootConfig } from '../context'
import { addFromRegistry } from './add'
import { fetchIndex } from '../lib/meta-loader'

const DEFAULT_CONFIG: BarefootConfig = {
  $schema: 'https://barefootjs.dev/schema/barefoot.json',
  paths: {
    components: 'components/ui',
    tokens: 'tokens',
    meta: 'meta',
  },
}

export async function run(args: string[], ctx: CliContext): Promise<void> {
  const projectDir = process.cwd()

  // Parse --name flag
  let name: string | undefined
  const nameIdx = args.indexOf('--name')
  if (nameIdx !== -1 && args[nameIdx + 1]) {
    name = args[nameIdx + 1]
  }

  // Parse --from flag
  let fromUrl: string | undefined
  const fromIdx = args.indexOf('--from')
  if (fromIdx !== -1 && args[fromIdx + 1]) {
    fromUrl = args[fromIdx + 1]
  }

  // Check if already initialized
  const configPath = path.join(projectDir, 'barefoot.json')
  if (existsSync(configPath)) {
    console.error('Error: barefoot.json already exists. Project is already initialized.')
    process.exit(1)
  }

  const config: BarefootConfig = { ...DEFAULT_CONFIG }
  if (name) config.name = name

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
  if (fromUrl) {
    studioConfig = parseStudioUrl(fromUrl)
    if (studioConfig && existsSync(destTokensJson)) {
      applyTokenOverrides(destTokensJson, studioConfig)
      console.log(`  Applied Studio token overrides`)
    }
  }

  // Generate tokens.css from tokens.json
  await generateTokensCSS(ctx.root, destTokensJson, tokensDir, config.paths.tokens)

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
      name: name || 'my-design-system',
      private: true,
      type: 'module',
      scripts: {
        test: 'bun test',
      },
      dependencies: {
        '@barefootjs/dom': 'workspace:*',
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
  if (fromUrl) {
    const registryUrl = deriveRegistryUrl(fromUrl)
    console.log(`\n  Fetching components from ${registryUrl}...`)
    try {
      const index = await fetchIndex(registryUrl)
      const allNames = index.components.map(c => c.name)
      if (allNames.length > 0) {
        await addFromRegistry(allNames, registryUrl, projectDir, config, true)
      }
    } catch (err) {
      console.error(`  Warning: Could not fetch components from registry: ${err instanceof Error ? err.message : err}`)
    }
  }

  console.log(`\nProject initialized successfully!`)
  console.log(`\nNext steps:`)
  console.log(`  bun install                    # Install dependencies`)
  if (!fromUrl) {
    console.log(`  barefoot add button checkbox   # Add components`)
  }
  console.log(`  bun test                       # Run component tests`)
  console.log(`  barefoot search <query>        # Search available components`)
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
  const targets = [tokensData.tokens, tokensData.colors, tokensData.spacing, tokensData.typography]
  for (const arr of targets) {
    if (!Array.isArray(arr)) continue
    for (const token of arr) {
      if (token.name === name) {
        token.value = value
        return
      }
    }
  }
}

function applyShadowPreset(tokensData: any, styleName: string): void {
  // Style presets (must match Studio's stylePresets)
  const presets: Record<string, Record<string, string>> = {
    Sharp: {
      '--shadow-sm': '0 1px 2px 0 rgb(0 0 0 / 0.04)',
      '--shadow': '0 1px 2px 0 rgb(0 0 0 / 0.06)',
      '--shadow-md': '0 2px 4px -1px rgb(0 0 0 / 0.08)',
      '--shadow-lg': '0 4px 8px -2px rgb(0 0 0 / 0.1)',
    },
    Soft: {
      '--shadow-sm': '0 1px 3px 0 rgb(0 0 0 / 0.06)',
      '--shadow': '0 2px 6px 0 rgb(0 0 0 / 0.08), 0 1px 3px -1px rgb(0 0 0 / 0.06)',
      '--shadow-md': '0 6px 12px -2px rgb(0 0 0 / 0.08), 0 3px 6px -3px rgb(0 0 0 / 0.06)',
      '--shadow-lg': '0 12px 24px -4px rgb(0 0 0 / 0.08), 0 6px 10px -5px rgb(0 0 0 / 0.06)',
    },
    Compact: {
      '--shadow-sm': 'none',
      '--shadow': 'none',
      '--shadow-md': 'none',
      '--shadow-lg': '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    },
  }

  const shadows = presets[styleName]
  if (!shadows) return

  for (const [name, value] of Object.entries(shadows)) {
    applySimpleOverride(tokensData, name, value)
  }
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
