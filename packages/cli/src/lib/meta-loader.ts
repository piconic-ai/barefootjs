// Load component metadata from ui/meta/ directory.

import { readFileSync, existsSync, readdirSync } from 'fs'
import path from 'path'
import type { CliContext } from '../context'
import type { MetaIndex, ComponentMeta, RegistryItem } from './types'
import { resolveComponentSource } from './resolve-source'

export function loadIndex(metaDir: string): MetaIndex {
  const indexPath = path.join(metaDir, 'index.json')
  if (!existsSync(indexPath)) {
    console.error(`Error: ${indexPath} not found.`)
    process.exit(1)
  }
  return JSON.parse(readFileSync(indexPath, 'utf-8'))
}

function registryIndexUrl(registryUrl: string): string {
  return registryUrl.endsWith('/')
    ? `${registryUrl}index.json`
    : `${registryUrl}/index.json`
}

export async function fetchIndex(registryUrl: string): Promise<MetaIndex> {
  const url = registryIndexUrl(registryUrl)
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) }).catch((err: Error) => {
    console.error(`Error: Failed to fetch registry at ${url}: ${err.message}`)
    process.exit(1)
  }) as Response
  if (!res.ok) {
    console.error(`Error: Registry returned HTTP ${res.status} for ${url}`)
    process.exit(1)
  }
  try {
    return await res.json()
  } catch {
    console.error(`Error: Invalid JSON from registry at ${url}`)
    process.exit(1)
  }
  throw new Error('unreachable')
}

export async function tryFetchIndex(registryUrl: string): Promise<MetaIndex | null> {
  const url = registryIndexUrl(registryUrl)
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function fetchRegistryItem(registryUrl: string, name: string): Promise<RegistryItem> {
  const base = registryUrl.endsWith('/') ? registryUrl : `${registryUrl}/`
  const url = `${base}${name}.json`
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) }).catch((err: Error) => {
    console.error(`Error: Failed to fetch component "${name}" from ${url}: ${err.message}`)
    process.exit(1)
  }) as Response
  if (!res.ok) {
    console.error(`Error: Registry returned HTTP ${res.status} for ${url}`)
    process.exit(1)
  }
  try {
    return await res.json()
  } catch {
    console.error(`Error: Invalid JSON from registry at ${url}`)
    process.exit(1)
  }
  throw new Error('unreachable')
}

/**
 * Try to load a component's meta JSON. Returns `null` instead of
 * exiting when the file isn't present, so callers can fall back to
 * source-derived rendering (`bf docs` for top-level page components,
 * #1403) before deciding whether to surface a hard error.
 *
 * The lookup is case-sensitive first, then falls back to a case-insensitive
 * scan so `bf docs Button` works even though `bf add` writes `button.json`.
 * Exact-case behavior is unchanged.
 *
 * The case-insensitive fallback intentionally returns `null` when multiple
 * meta files differ only by case (e.g. `Button.json` *and* `button.json`):
 * picking either one would be nondeterministic — `readdirSync` ordering is
 * filesystem-dependent — and the caller's "not found" transcript surfaces
 * the conflict to the user instead of silently choosing.
 */
export function tryLoadComponent(metaDir: string, name: string): ComponentMeta | null {
  const filePath = path.join(metaDir, `${name}.json`)
  if (existsSync(filePath)) return JSON.parse(readFileSync(filePath, 'utf-8'))
  // Case-insensitive fallback against the meta dir contents.
  if (!existsSync(metaDir)) return null
  const wanted = `${name.toLowerCase()}.json`
  let entries: string[]
  try {
    entries = readdirSync(metaDir)
  } catch {
    return null
  }
  const matches: string[] = []
  for (const entry of entries) {
    if (entry.toLowerCase() === wanted) matches.push(entry)
  }
  // 1 → unambiguous match. 0 or 2+ → bail; 2+ would otherwise be
  // resolution-order roulette.
  if (matches.length !== 1) return null
  return JSON.parse(readFileSync(path.join(metaDir, matches[0]), 'utf-8'))
}

/**
 * Build the user-facing error message for a missing component lookup.
 *
 * When `ctx` is provided, the formatter consults `resolveComponentSource`
 * to detect when the user is asking about a component whose source
 * lives **outside** `paths.components` (e.g. the scaffold's
 * `components/Counter.tsx`) — meaning `bf meta extract` would not have
 * picked it up no matter how many times it was run. In that case the
 * error redirects the user at the commands that actually work for
 * top-level page components (`bf debug graph`, `bf gen test`) instead
 * of repeating the misleading "run `bf meta extract`" hint (#1403).
 */
export function formatMissingComponentError(
  metaDir: string,
  name: string,
  ctx?: CliContext,
): string[] {
  const filePath = path.join(metaDir, `${name}.json`)
  const lines: string[] = []
  lines.push(`Error: Component "${name}" not found at ${filePath}.`)

  if (ctx) {
    const resolved = resolveComponentSource(name, ctx)
    if (resolved && isTopLevelSource(resolved.filePath, ctx)) {
      const rel = path.relative(ctx.projectDir ?? ctx.root, resolved.filePath)
      lines.push(``)
      lines.push(
        `"${name}" appears to be a top-level page component (${rel}), not a UI`,
      )
      lines.push(
        `registry component. \`bf docs\` / \`bf gen preview\` only cover registry`,
      )
      lines.push(`components (under \`paths.components\` in barefoot.config.ts).`)
      lines.push(``)
      lines.push(`For top-level components, try:`)
      lines.push(`  bf debug graph ${name}    — reactive structure`)
      lines.push(`  bf debug signals ${name}  — signal initialisation trace`)
      lines.push(`  bf gen test ${name}       — generate an IR test`)
      return lines
    }
  }

  const indexPath = path.join(metaDir, 'index.json')
  lines.push(`Available components are listed in ${indexPath}.`)
  lines.push(
    `If you just ran \`bf add ${name}\`, run \`bf meta extract\` to regenerate the meta index.`,
  )
  return lines
}

/**
 * `true` when `filePath` lies under one of the project's `sourceDirs`
 * (e.g. `components/Counter.tsx`) rather than the UI registry path
 * (`paths.components`, e.g. `components/ui/`). Used by the docs error
 * formatter to decide whether the user is asking about a page
 * component vs. a missing registry entry.
 */
function isTopLevelSource(filePath: string, ctx: CliContext): boolean {
  if (!ctx.projectDir || !ctx.config) return false
  const registryRoot = path.resolve(ctx.projectDir, ctx.config.paths.components)
  const abs = path.resolve(filePath)
  // A source under `paths.components` is a registry hit, not page.
  if (abs.startsWith(registryRoot + path.sep) || abs === registryRoot) return false
  // It's a "top-level" source iff it lies under one of the
  // configured source dirs — otherwise it might be a stray file the
  // formatter shouldn't editorialise about.
  for (const dir of ctx.config.sourceDirs ?? []) {
    const base = path.resolve(ctx.projectDir, dir)
    if (abs.startsWith(base + path.sep) || abs === base) return true
  }
  return false
}

export function loadComponent(metaDir: string, name: string, ctx?: CliContext): ComponentMeta {
  const meta = tryLoadComponent(metaDir, name)
  if (meta) return meta
  for (const line of formatMissingComponentError(metaDir, name, ctx)) {
    console.error(line)
  }
  process.exit(1)
}
