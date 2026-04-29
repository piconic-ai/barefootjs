// `barefoot studio apply <url>` — Apply a Studio-encoded token config
// (from a `?c=...` URL) onto an existing project's tokens.
//
// Reads `paths.tokens` from `barefoot.config.ts`, then:
//   1. Patches `<tokens>/tokens.json` with color / spacing / radius / font /
//      shadow overrides decoded from the Studio URL.
//   2. Regenerates `<tokens>/tokens.css` from the patched JSON if the
//      monorepo's token module is reachable (skipped silently otherwise).
//   3. Appends CSS variable overrides that aren't represented in
//      tokens.json (e.g. `--spacing`) to `<tokens>/tokens.css`.

import { existsSync, readFileSync, writeFileSync } from 'fs'
import path from 'path'
import type { CliContext } from '../context'

export interface StudioConfig {
  style?: string
  tokens?: Record<string, { light?: string; dark?: string }>
  spacing?: string
  radius?: string
  font?: string
}

export async function run(args: string[], ctx: CliContext): Promise<void> {
  const sub = args[0]
  if (sub !== 'apply') {
    printUsage()
    process.exit(sub ? 1 : 0)
  }

  const url = args[1]
  if (!url) {
    console.error('Error: studio apply requires a Studio URL.')
    console.error('Usage: barefoot studio apply <url>')
    process.exit(1)
  }

  if (!ctx.config || !ctx.projectDir) {
    console.error('Error: project config not found. Run `barefoot init` first.')
    process.exit(1)
  }

  const studioConfig = parseStudioUrl(url)
  if (!studioConfig) {
    console.error('Error: could not decode Studio config from the URL (no `?c=` param or malformed payload).')
    process.exit(1)
  }

  const tokensDir = path.resolve(ctx.projectDir, ctx.config.paths.tokens)
  const tokensJsonPath = path.join(tokensDir, 'tokens.json')
  const tokensCssPath = path.join(tokensDir, 'tokens.css')

  if (!existsSync(tokensJsonPath)) {
    console.error(`Error: ${path.relative(ctx.projectDir, tokensJsonPath)} not found.`)
    console.error('       Studio overrides need an existing tokens.json to patch.')
    process.exit(1)
  }

  applyTokenOverrides(tokensJsonPath, studioConfig)
  console.log(`  Patched ${path.relative(ctx.projectDir, tokensJsonPath)}`)

  await generateTokensCSS(ctx.root, tokensJsonPath, tokensDir, ctx.config.paths.tokens)

  appendCSSOverrides(tokensCssPath, studioConfig)
}

function printUsage(): void {
  console.log(`Usage: barefoot studio <subcommand>

Subcommands:
  apply <url>    Apply a Studio token config (\`?c=...\` URL) to this project's tokens
`)
}

// ── URL parsing ──

export function parseStudioUrl(url: string): StudioConfig | undefined {
  try {
    const parsed = new URL(url)
    const encoded = parsed.searchParams.get('c')
    if (!encoded) return undefined
    const json = atob(decodeURIComponent(encoded))
    return JSON.parse(json)
  } catch {
    return undefined
  }
}

// ── Token override logic ──

export function applyTokenOverrides(tokensJsonPath: string, config: StudioConfig): void {
  const raw = readFileSync(tokensJsonPath, 'utf-8')
  const tokensData = JSON.parse(raw)

  if (config.tokens) {
    for (const [name, values] of Object.entries(config.tokens)) {
      applyColorOverride(tokensData, name, values)
    }
  }

  if (config.spacing) {
    applySimpleOverride(tokensData, '--spacing', config.spacing)
  }

  if (config.radius) {
    applySimpleOverride(tokensData, '--radius', config.radius)
  }

  if (config.font) {
    // Font key → font-family value mapping (mirrors Studio's font picker).
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
  // tokens.json uses bare names (e.g. "radius") without the `--` prefix.
  const bareName = name.startsWith('--') ? name.slice(2) : name

  const sections = [
    tokensData.colors, tokensData.spacing, tokensData.borderRadius,
    tokensData.shadows, tokensData.layout,
  ]
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
  // Preset names mirror Studio's stylePresets. Bare keys to match tokens.json.
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
 * (e.g., `--spacing` is a Tailwind v4 variable, not in our token schema).
 */
export function appendCSSOverrides(cssPath: string, config: StudioConfig): void {
  if (!existsSync(cssPath)) return

  const lines: string[] = []
  if (config.spacing) {
    lines.push(`  --spacing: ${config.spacing};`)
  }

  if (lines.length === 0) return

  const existing = readFileSync(cssPath, 'utf-8')
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
    console.log(`  Regenerated ${tokensRelDir}/tokens.css`)
  } catch {
    // Token generation requires the monorepo's `site/shared/tokens` module.
    // In a published CLI bundle this is unreachable; the user re-runs their
    // build pipeline to project tokens.json into tokens.css.
    console.log(`  Skipped tokens.css regeneration (run your tokens build pipeline)`)
  }
}
