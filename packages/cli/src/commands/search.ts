// bf search — find components and documentation by name, category, or tags.

import path from 'path'
import type { CliContext } from '../context'
import type { MetaIndex } from '../lib/types'
import { loadIndex, fetchIndex } from '../lib/meta-loader'
import { scanCoreDocs, type CoreDocMeta } from '../lib/docs-loader'

// Default upstream UI component registry. Surfaced in the hint footer
// when search is running against local meta only, so users (and AI
// agents) discover that the registry exists without having to know to
// pass --registry. Mirrored from add.ts / init.ts.
const DEFAULT_REGISTRY_URL = 'https://ui.barefootjs.dev/r/'

// Category aliases for better search (e.g., "form" → "input" components)
const categoryAliases: Record<string, string[]> = {
  'form': ['input'],
  'modal': ['overlay'],
  'nav': ['navigation'],
  'menu': ['navigation', 'overlay'],
  'signal': ['reactivity'],
  'compiler': ['advanced'],
  'template': ['adapters'],
}

export interface SearchResult {
  name: string
  type: 'component' | 'doc'
  category: string
  description: string
  stateful?: boolean
}

export function search(query: string, index: MetaIndex, coreDocs?: CoreDocMeta[]): SearchResult[] {
  const q = query.toLowerCase()
  const aliasCategories = categoryAliases[q] || []

  const componentResults: SearchResult[] = index.components
    .filter(c =>
      c.name.includes(q) ||
      c.category.includes(q) ||
      aliasCategories.includes(c.category) ||
      c.description.toLowerCase().includes(q) ||
      c.tags.some(t => t.includes(q))
    )
    .map(c => ({
      name: c.name,
      type: 'component' as const,
      category: c.category,
      description: c.description,
      stateful: c.stateful,
    }))

  const docResults: SearchResult[] = (coreDocs ?? [])
    .filter(d =>
      d.slug.includes(q) ||
      d.title.toLowerCase().includes(q) ||
      d.category.includes(q) ||
      aliasCategories.includes(d.category) ||
      d.description.toLowerCase().includes(q)
    )
    .map(d => ({
      name: d.slug,
      type: 'doc' as const,
      category: d.category,
      description: d.description,
    }))

  return [...componentResults, ...docResults]
}

export interface PrintOptions {
  /** Where component results came from (e.g. `local meta/`, hostname). */
  sourceLabel: string
  /**
   * `true` when search is running against local meta/ and no
   * `--registry` was given — adds a one-line hint pointing at the
   * upstream registry so the caller (or an AI agent) doesn't conclude
   * a component is unavailable just because it hasn't been added to
   * the project yet.
   */
  hintRegistry: boolean
}

/**
 * Resolve the PrintOptions describing what source `run()` is about to
 * search. Exported so the labelling rules (and the registry hint
 * trigger) are unit-testable without spawning the CLI.
 */
export function resolvePrintOptions(opts: {
  registryUrl?: string
  dirFlagUsed: boolean
  metaDir: string
  cwd: string
  /**
   * `true` when the metaDir resolves into the BarefootJS monorepo's
   * own `ui/meta/` registry — i.e. the fallback `createContext` picks
   * when no `barefoot.config.ts` is found. The hint pointing at
   * `ui.barefootjs.dev/r/` would be redundant there because that
   * directory IS the source the published registry is built from.
   */
  isMonorepoRegistry: boolean
}): PrintOptions {
  if (opts.registryUrl) {
    return {
      sourceLabel: new URL(opts.registryUrl).hostname,
      hintRegistry: false,
    }
  }
  // Always show the actual path so the label can never lie. Default
  // `metaDir` is the project's own `meta/` when invoked inside a
  // scaffold, but falls back to the monorepo's `ui/meta/` (~30
  // components) when no `barefoot.config.ts` is found — a fixed
  // "local meta/" label hid that distinction and made the hint read
  // as a contradiction in the monorepo case.
  const rel = path.relative(opts.cwd, opts.metaDir)
  const display = rel === '' ? '.' : rel.startsWith('..') ? opts.metaDir : rel
  return {
    sourceLabel: display,
    // Skip the upstream-registry hint when reading from the monorepo's
    // own registry source — that IS what the published registry mirrors.
    // `--dir` is an explicit scope choice, so skip the hint there too.
    hintRegistry: !opts.isMonorepoRegistry && !opts.dirFlagUsed,
  }
}

export function printSearchResults(results: SearchResult[], jsonFlag: boolean, opts: PrintOptions) {
  if (jsonFlag) {
    console.log(JSON.stringify(results, null, 2))
    return
  }

  console.log(`Searching: ${opts.sourceLabel}`)
  if (opts.hintRegistry) {
    console.log(
      `(run with --registry ${DEFAULT_REGISTRY_URL} to also search the upstream component registry)`,
    )
  }
  console.log()

  if (results.length === 0) {
    console.log('No results found.')
    return
  }

  // Table format
  const nameWidth = Math.max(25, ...results.map(r => r.name.length + 2))
  const typeWidth = 12
  const catWidth = 16
  const header = `${'NAME'.padEnd(nameWidth)}${'TYPE'.padEnd(typeWidth)}${'CATEGORY'.padEnd(catWidth)}DESCRIPTION`
  console.log(header)
  console.log('-'.repeat(header.length))
  for (const r of results) {
    const statefulMark = r.stateful ? ' *' : ''
    console.log(`${(r.name + statefulMark).padEnd(nameWidth)}${r.type.padEnd(typeWidth)}${r.category.padEnd(catWidth)}${r.description.slice(0, 50)}`)
  }

  const componentCount = results.filter(r => r.type === 'component').length
  const docCount = results.filter(r => r.type === 'doc').length
  const parts: string[] = []
  if (componentCount > 0) parts.push(`${componentCount} component(s)`)
  if (docCount > 0) parts.push(`${docCount} doc(s)`)
  console.log(`\n${parts.join(', ')} found. (* = stateful)`)
  console.log(`Use 'bf docs <name>' or 'bf guide <name>' for details.`)
}

export async function run(args: string[], ctx: CliContext): Promise<void> {
  // Parse --dir flag
  let metaDir = ctx.metaDir
  const dirIdx = args.indexOf('--dir')
  if (dirIdx !== -1) {
    const dirValue = args[dirIdx + 1]
    if (!dirValue || dirValue.startsWith('-')) {
      console.error('Error: --dir requires a path argument.')
      process.exit(1)
    }
    metaDir = path.resolve(dirValue)
    args = [...args.slice(0, dirIdx), ...args.slice(dirIdx + 2)]
  }

  // Parse --registry flag
  let registryUrl: string | undefined
  const regIdx = args.indexOf('--registry')
  if (regIdx !== -1) {
    const regValue = args[regIdx + 1]
    if (!regValue || regValue.startsWith('-')) {
      console.error('Error: --registry requires a URL argument.')
      process.exit(1)
    }
    registryUrl = regValue
    args = [...args.slice(0, regIdx), ...args.slice(regIdx + 2)]
  }

  // Mutual exclusion
  if (dirIdx !== -1 && registryUrl) {
    console.error('Error: --dir and --registry cannot be used together.')
    process.exit(1)
  }

  // Load component index from local or remote source
  const index = registryUrl
    ? await fetchIndex(registryUrl)
    : loadIndex(metaDir)

  // Surface the source so callers (and AI agents) don't silently miss
  // the upstream registry when running against local meta/ only.
  // `projectDir === null` means `createContext` fell back to the
  // monorepo's `ui/meta/` (no `barefoot.config.ts` found walking up
  // from cwd); the upstream hint would point at the same data so we
  // suppress it there.
  const printOpts = resolvePrintOptions({
    registryUrl,
    dirFlagUsed: dirIdx !== -1,
    metaDir,
    cwd: process.cwd(),
    isMonorepoRegistry: ctx.projectDir === null,
  })

  // Load core docs (skip gracefully if not available)
  const docsDir = path.join(ctx.root, 'docs/core')
  const coreDocs = scanCoreDocs(docsDir)

  const query = args.join(' ')
  if (!query) {
    // No query: list all
    const allResults: SearchResult[] = [
      ...index.components.map(c => ({
        name: c.name,
        type: 'component' as const,
        category: c.category,
        description: c.description,
        stateful: c.stateful,
      })),
      ...coreDocs.map(d => ({
        name: d.slug,
        type: 'doc' as const,
        category: d.category,
        description: d.description,
      })),
    ]
    printSearchResults(allResults, ctx.jsonFlag, printOpts)
  } else {
    const results = search(query, index, coreDocs)
    const hasComponentHits = results.some(r => r.type === 'component')

    if (!hasComponentHits && printOpts.hintRegistry) {
      try {
        const upstreamIndex = await fetchIndex(DEFAULT_REGISTRY_URL)
        const upstreamResults = search(query, upstreamIndex)
        if (upstreamResults.length > 0) {
          const upstreamOpts: PrintOptions = {
            sourceLabel: new URL(DEFAULT_REGISTRY_URL).hostname,
            hintRegistry: false,
          }
          printSearchResults([...results, ...upstreamResults], ctx.jsonFlag, upstreamOpts)
          if (!ctx.jsonFlag) {
            console.log(`\nInstall with: bf add <name>`)
          }
          return
        }
      } catch {
        // Registry unreachable — fall through to local-only output.
      }
    }

    printSearchResults(results, ctx.jsonFlag, printOpts)
  }
}
