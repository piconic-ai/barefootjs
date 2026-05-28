// Design-token loading + CSS generation, owned by the CLI.
//
// Types come from the workspace-only `site/shared/tokens/schema` (erased
// at compile time), but the runtime logic is reimplemented here so the
// published CLI carries no runtime dependency on `site/shared`. Mirrors
// `site/shared/tokens/generate-css.ts`.
//
// Token resolution order (see loadTokenSet):
//   1. `<projectDir>/<paths.tokens>/tokens.json` — user's full override
//   2. `<repoRoot>/site/shared/tokens/tokens.json` — monorepo source
//   3. `<cli-dist>/tokens.json` — bundled default (shipped by build.mjs)

import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CliContext } from '../context'
import type { TokenSet, Token, ColorToken } from '../../../../site/shared/tokens/schema'
import { fileExists } from './runtime'

export type { TokenSet, Token, ColorToken } from '../../../../site/shared/tokens/schema'

const thisFile = fileURLToPath(import.meta.url)

export async function loadTokens(jsonPath: string): Promise<TokenSet> {
  const content = await readFile(jsonPath, 'utf-8')
  return JSON.parse(content) as TokenSet
}

/** Merge multiple TokenSets. Later sets override earlier ones (by token name). */
export function mergeTokenSets(...sets: TokenSet[]): TokenSet {
  if (sets.length === 0) throw new Error('mergeTokenSets requires at least one TokenSet')
  if (sets.length === 1) return sets[0]

  const base = structuredClone(sets[0])

  for (let i = 1; i < sets.length; i++) {
    const ext = sets[i]
    mergeTokenArray(base.typography.fontFamily, ext.typography.fontFamily)
    mergeTokenArray(base.typography.letterSpacing, ext.typography.letterSpacing)
    mergeTokenArray(base.spacing, ext.spacing)
    mergeTokenArray(base.borderRadius, ext.borderRadius)
    mergeTokenArray(base.transitions.duration, ext.transitions.duration)
    mergeTokenArray(base.transitions.easing, ext.transitions.easing)
    mergeTokenArray(base.layout, ext.layout)
    mergeTokenArray(base.colors, ext.colors)
    mergeTokenArray(base.shadows, ext.shadows)
  }

  return base
}

function mergeTokenArray<T extends Token>(base: T[], ext: T[]): void {
  for (const token of ext) {
    const idx = base.findIndex(t => t.name === token.name)
    if (idx >= 0) base[idx] = token
    else base.push(token)
  }
}

/**
 * Generate a CSS string from a TokenSet — `:root { ... }` plus a `.dark { ... }`
 * block for color tokens that declare a dark value.
 */
export function generateCSS(tokenSet: TokenSet): string {
  const rootLines: string[] = []
  const darkLines: string[] = []

  function addSection(label: string, tokens: Token[]) {
    if (tokens.length === 0) return
    rootLines.push(`  /* ── ${label} ${'─'.repeat(Math.max(1, 50 - label.length))} */`)
    for (const t of tokens) rootLines.push(`  --${t.name}: ${t.value};`)
    rootLines.push('')
  }

  function addColorSection(tokens: ColorToken[]) {
    if (tokens.length === 0) return
    rootLines.push(`  /* ── Colors (OKLCH, neutral theme) ${'─'.repeat(15)} */`)
    for (const t of tokens) rootLines.push(`  --${t.name}: ${t.value};`)
    rootLines.push('')

    for (const t of tokens.filter(t => t.dark)) {
      darkLines.push(`  --${t.name}: ${t.dark};`)
    }
  }

  addSection('Typography', [...tokenSet.typography.fontFamily, ...tokenSet.typography.letterSpacing])
  addSection('Spacing scale', tokenSet.spacing)
  addSection('Border radius', tokenSet.borderRadius)
  addSection('Transitions', [...tokenSet.transitions.duration, ...tokenSet.transitions.easing])
  addSection('Layout', tokenSet.layout)
  addColorSection(tokenSet.colors)
  addSection('Shadows', tokenSet.shadows)

  const header = `/**
 * AUTO-GENERATED — Do not edit manually.
 * Generated from tokens.json.
 *
 * BarefootJS Design Tokens
 */`

  let css = `${header}\n\n:root {\n${rootLines.join('\n')}}\n`
  if (darkLines.length > 0) css += `\n.dark {\n${darkLines.join('\n')}\n}\n`
  return css
}

/**
 * Locate the base `tokens.json`: monorepo source first, then the default
 * bundled next to the CLI's `dist/index.js`. Returns null when neither exists.
 */
function findBaseTokensJson(ctx: CliContext): string | null {
  const monorepoTokens = resolve(ctx.root, 'site/shared/tokens/tokens.json')
  if (existsSync(monorepoTokens)) return monorepoTokens

  const bundledTokens = resolve(dirname(thisFile), 'tokens.json')
  if (existsSync(bundledTokens)) return bundledTokens

  return null
}

/**
 * Resolve the effective TokenSet for the current environment, following
 * the user → monorepo → bundled-default order documented above.
 */
export async function loadTokenSet(ctx: CliContext): Promise<TokenSet> {
  // 1. User-supplied full override — honoured as the base (no merge) so
  //    the user has total control once they maintain the file.
  if (ctx.projectDir && ctx.config?.paths.tokens) {
    const userTokens = resolve(ctx.projectDir, ctx.config.paths.tokens, 'tokens.json')
    if (await fileExists(userTokens)) return loadTokens(userTokens)
  }

  // 2. Default base — monorepo source or bundled CLI fallback.
  const basePath = findBaseTokensJson(ctx)
  if (!basePath) {
    throw new Error(
      'Cannot locate default tokens.json. Reinstall @barefootjs/cli — the published tarball should include it.',
    )
  }
  const base = await loadTokens(basePath)

  // 3. Monorepo-only: merge the UI extension layer when present.
  const uiJsonPath = resolve(ctx.root, 'site/ui/tokens.json')
  if (await fileExists(uiJsonPath)) {
    return mergeTokenSets(base, await loadTokens(uiJsonPath))
  }
  return base
}

/** Convenience: resolve the TokenSet and render it to a CSS string. */
export async function loadTokensCss(ctx: CliContext): Promise<string> {
  return generateCSS(await loadTokenSet(ctx))
}
