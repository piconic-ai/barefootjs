// bf compat — compile every requested ui/ component against every
// workspace TemplateAdapter (compileJSX + adapter.generate(), all
// in-process, no language runtimes) and report a
// component × adapter → ✓ / BF10x matrix. `bf compat --all --json`
// is the generator behind the committed `ui/compat.lock.json`
// (see the root `compat:lock` script) — CI regenerates it and diffs.
//
// This measures COMPILE-time compatibility only, not render identity;
// rendered-output parity is owned by the adapter conformance suite
// (packages/adapter-tests) and the eval vector corpus.

import { readFileSync, writeFileSync } from 'fs'
import path from 'path'
import type { CliContext } from '../context'
import { globFiles } from '../lib/runtime'
import { resolveComponentSource } from '../lib/resolve-source'
import { loadCompatAdapters } from '../lib/compat/adapter-registry'
import { compileForCompat, buildCompatCell, type CompatCell } from '../lib/compat/engine'
import { buildCompatReport, formatCompatJson, formatCompatMarkdown, type CompatReport } from '../lib/compat/report'

interface CompatTarget {
  name: string
  filePath: string
}

/** Mirrors `bf meta extract`'s enumeration (packages/cli/src/commands/meta-extract.ts). */
async function enumerateAllComponents(ctx: CliContext): Promise<CompatTarget[]> {
  const inProject = ctx.config !== null && ctx.projectDir !== null
  const componentsDir = inProject
    ? path.resolve(ctx.projectDir!, ctx.config!.paths.components)
    : path.join(ctx.root, 'ui/components/ui')

  const matched = await globFiles('*/index.tsx', { cwd: componentsDir })
  return matched
    .map(f => path.join(componentsDir, f))
    .sort()
    .map(filePath => ({ name: path.basename(path.dirname(filePath)), filePath }))
}

/** Same canonical-name derivation `bf docs` uses for source-derived components (commands/docs.ts). */
function resolveNamedTarget(query: string, ctx: CliContext): CompatTarget | null {
  const resolved = resolveComponentSource(query, ctx)
  if (!resolved) return null
  const base = path.basename(resolved.filePath, path.extname(resolved.filePath))
  const name = base === 'index' ? path.basename(path.dirname(resolved.filePath)) : base
  return { name, filePath: resolved.filePath }
}

function summarize(report: CompatReport): string {
  const componentCount = Object.keys(report.components).length
  let total = 0
  let ok = 0
  for (const row of Object.values(report.components)) {
    for (const cell of Object.values(row)) {
      total++
      if (cell.ok) ok++
    }
  }
  return `${componentCount} component(s) × ${report.adapters.length} adapter(s) = ${total} cell(s) (${ok} ok, ${total - ok} with diagnostics)`
}

export async function run(args: string[], ctx: CliContext): Promise<void> {
  const all = args.includes('--all')
  // `--md` is accepted for explicitness/documentation purposes — Markdown
  // is already the non-`--json` default (report.ts only defines JSON and
  // Markdown formatters), so the flag doesn't change any branching below,
  // it's just excluded from the positional `names` list.
  const outIdx = args.indexOf('--out')
  const outPath = outIdx !== -1 ? args[outIdx + 1] : undefined

  const names = args.filter((arg, i) => {
    if (arg === '--all' || arg === '--md' || arg === '--out') return false
    if (outIdx !== -1 && i === outIdx + 1) return false
    return !arg.startsWith('--')
  })

  if (!all && names.length === 0) {
    console.error('Usage: bf compat <component...>|--all [--md] [--out <path>]')
    process.exit(1)
    return
  }

  // Resolve every requested target up front so an unresolvable name
  // fails the whole run before any (potentially slow) compiling starts.
  const targets = new Map<string, CompatTarget>()
  if (all) {
    for (const target of await enumerateAllComponents(ctx)) {
      targets.set(target.name, target)
    }
  }

  const unresolved: string[] = []
  for (const query of names) {
    const target = resolveNamedTarget(query, ctx)
    if (!target) {
      unresolved.push(query)
      continue
    }
    targets.set(target.name, target)
  }

  if (unresolved.length > 0) {
    for (const query of unresolved) {
      console.error(`Error: component not found: ${query}`)
    }
    process.exit(1)
    return
  }

  const { loaded, skipped } = await loadCompatAdapters()
  for (const s of skipped) {
    console.error(`Skipping ${s.pkg}: ${s.reason}`)
  }
  if (loaded.length === 0) {
    console.error('No adapters resolved — cannot build a compat matrix.')
    process.exit(1)
    return
  }

  const cells: Record<string, Record<string, CompatCell>> = {}
  for (const target of [...targets.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    console.error(`Compiling ${target.name}...`)
    const source = readFileSync(target.filePath, 'utf-8')
    const row: Record<string, CompatCell> = {}
    for (const adapter of loaded) {
      const instance = adapter.factory()
      const errors = compileForCompat(source, target.filePath, instance, 'build')
      row[adapter.id] = buildCompatCell(errors, adapter.pins)
    }
    cells[target.name] = row
  }

  const report = buildCompatReport(cells)
  const text = ctx.jsonFlag ? formatCompatJson(report) : formatCompatMarkdown(report)

  if (outPath) {
    const resolved = path.isAbsolute(outPath) ? outPath : path.resolve(process.cwd(), outPath)
    writeFileSync(resolved, text)
    console.error(`Wrote compat report → ${resolved}`)
  } else {
    console.log(text)
  }

  console.error(summarize(report))
}
