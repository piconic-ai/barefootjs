// `bf tokens apply <url>` — Apply a Studio-encoded token config
// (from a `?c=...` URL) onto an existing project's tokens.
//
// Primary action: rewrite CSS variable values inside the project's
// `tokens.css` so the change is visible on the next page load. The
// runtime reads `tokens.css`, not `tokens.json`, so direct CSS
// patching is the source of truth for end-user apps. Search order:
// `<paths.tokens>/tokens.css` → `public/tokens.css` → `static/tokens.css`.
//
// Secondary action (best-effort): if `<paths.tokens>/tokens.json`
// exists (monorepo convention), patch it too so a subsequent
// tokens-build pipeline regenerates `tokens.css` from the same JSON.
// Silent skip when the file isn't there — end-user scaffolds don't
// ship a tokens.json.

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

// Font key → font-family value mapping (mirrors Studio's font picker).
const FONT_MAP: Record<string, string> = {
  system: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif',
  inter: '"Inter", sans-serif',
  'noto-sans': '"Noto Sans", sans-serif',
  'nunito-sans': '"Nunito Sans", sans-serif',
  figtree: '"Figtree", sans-serif',
}

// Shadow presets — mirror Studio's stylePresets. Names use the bare
// shadow token (no leading `--`) so we can share with the JSON-patching
// path that uses bare names too.
const SHADOW_PRESETS: Record<string, Record<string, string>> = {
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

export async function run(args: string[], ctx: CliContext): Promise<void> {
  const url = args[0]
  if (!url) {
    console.error('Error: tokens apply requires a Studio URL.')
    console.error('Usage: bf tokens apply <url>')
    process.exit(1)
  }

  // The CSS lookup falls back to bare cwd when `vite.config.ts` is
  // missing, so an app that hasn't run the scaffolder yet still gets a
  // useful error pointing at the directory we searched.
  const projectDir = ctx.projectDir ?? process.cwd()
  const tokensRelDir = ctx.config?.paths.tokens ?? 'tokens'

  const studioConfig = parseStudioUrl(url)
  if (!studioConfig) {
    console.error('Error: could not decode Studio config from the URL (no `?c=` param or malformed payload).')
    process.exit(1)
  }

  // ── 1. Patch tokens.css (primary, end-user source of truth) ──
  const cssPath = resolveTokensCss(projectDir, tokensRelDir)
  if (!cssPath) {
    console.error('Error: tokens.css not found. Checked:')
    for (const p of candidateCssPaths(projectDir, tokensRelDir)) {
      console.error(`  - ${path.relative(projectDir, p)}`)
    }
    console.error('       Run `npm create barefootjs@latest` to scaffold a project first.')
    process.exit(1)
  }

  applyCssOverrides(cssPath, studioConfig)
  console.log(`  Patched ${path.relative(projectDir, cssPath)}`)

  // ── 2. Patch tokens.json (best-effort, monorepo convention) ──
  const tokensJsonPath = path.join(projectDir, tokensRelDir, 'tokens.json')
  if (existsSync(tokensJsonPath)) {
    applyTokenOverrides(tokensJsonPath, studioConfig)
    console.log(`  Patched ${path.relative(projectDir, tokensJsonPath)}`)
  }
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

// ── tokens.css resolution ──

function candidateCssPaths(projectDir: string, tokensRelDir: string): string[] {
  // Order matches how adapters scaffold. `public/` covers every shipped
  // adapter today (hono, hono-node, csr, mojo, echo). `<paths.tokens>/`
  // covers monorepo / hand-built layouts where the source CSS lives
  // next to tokens.json. `static/` is kept as a generic fallback for
  // adapters that mirror the Go-template convention.
  return [
    path.join(projectDir, tokensRelDir, 'tokens.css'),
    path.join(projectDir, 'public', 'tokens.css'),
    path.join(projectDir, 'static', 'tokens.css'),
  ]
}

export function resolveTokensCss(projectDir: string, tokensRelDir: string): string | undefined {
  for (const p of candidateCssPaths(projectDir, tokensRelDir)) {
    if (existsSync(p)) return p
  }
  return undefined
}

// ── tokens.css patching ──

interface BlockOverrides {
  /** Overrides for `:root { ... }` (light-mode + non-color tokens). */
  root: Record<string, string>
  /** Overrides for `.dark { ... }` (dark-mode color tokens). */
  dark: Record<string, string>
}

function buildBlockOverrides(config: StudioConfig): BlockOverrides {
  const root: Record<string, string> = {}
  const dark: Record<string, string> = {}

  if (config.spacing) root['--spacing'] = config.spacing
  if (config.radius) root['--radius'] = config.radius
  if (config.font) {
    root['--font-sans'] = FONT_MAP[config.font] ?? config.font
  }
  if (config.style) {
    const preset = SHADOW_PRESETS[config.style]
    if (preset) {
      for (const [name, value] of Object.entries(preset)) {
        root[`--${name}`] = value
      }
    }
  }
  if (config.tokens) {
    for (const [name, values] of Object.entries(config.tokens)) {
      if (values.light !== undefined) root[`--${name}`] = values.light
      if (values.dark !== undefined) dark[`--${name}`] = values.dark
    }
  }

  return { root, dark }
}

export function applyCssOverrides(cssPath: string, config: StudioConfig): void {
  const overrides = buildBlockOverrides(config)
  let css = readFileSync(cssPath, 'utf-8')
  css = patchBlock(css, /:root\s*\{/, overrides.root)
  css = patchBlock(css, /\.dark\s*\{/, overrides.dark)
  writeFileSync(cssPath, css)
}

/**
 * Replace CSS variable declarations inside the first block matched by
 * `openRe`. Existing declarations are rewritten in place; new ones are
 * appended just before the closing brace under a `Studio overrides`
 * comment so re-runs stay idempotent (the second run finds them in
 * place and rewrites instead of re-appending).
 */
function patchBlock(css: string, openRe: RegExp, overrides: Record<string, string>): string {
  if (Object.keys(overrides).length === 0) return css

  const openMatch = openRe.exec(css)
  if (!openMatch) return css

  const blockStart = openMatch.index + openMatch[0].length
  let depth = 1
  let blockEnd = -1
  for (let i = blockStart; i < css.length; i++) {
    const ch = css[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) { blockEnd = i; break }
    }
  }
  if (blockEnd === -1) return css

  let block = css.slice(blockStart, blockEnd)
  const toAppend: Array<[string, string]> = []

  for (const [name, value] of Object.entries(overrides)) {
    const re = new RegExp(`(${escapeRegex(name)}\\s*:\\s*)[^;]+(;)`)
    if (re.test(block)) {
      block = block.replace(re, `$1${value}$2`)
    } else {
      toAppend.push([name, value])
    }
  }

  if (toAppend.length > 0) {
    const lines = toAppend.map(([n, v]) => `  ${n}: ${v};`).join('\n')
    const trailing = block.match(/\s*$/)?.[0] ?? ''
    block = block.slice(0, block.length - trailing.length) +
      `\n\n  /* ── Studio overrides ── */\n${lines}\n`
  }

  return css.slice(0, blockStart) + block + css.slice(blockEnd)
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ── tokens.json patching (best-effort, monorepo convention) ──

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
    const fontValue = FONT_MAP[config.font] || config.font
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
  const shadows = SHADOW_PRESETS[styleName]
  if (!shadows) return
  for (const [name, value] of Object.entries(shadows)) {
    applySimpleOverride(tokensData, name, value)
  }
}
