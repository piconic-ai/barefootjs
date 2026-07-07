#!/usr/bin/env node
// @barefootjs/compat CLI entry — compile every requested ui/ component
// against every workspace TemplateAdapter (compileJSX + adapter.generate(),
// all in-process, no language runtimes) and report a
// component × adapter → ✓ / BF10x matrix.
//
// Invocation: `bun run packages/compat/src/cli.ts [component…|--all] [--md] [--json] [--out <path>]`
// (or via the root scripts `bun run compat` / `bun run compat:lock`).
// `--all --json --out ui/compat.lock.json` is the generator behind the
// committed `ui/compat.lock.json` (see the root `compat:lock` script) —
// CI regenerates it and diffs.
//
// `--render <path>` is a separate, compile-free mode: it reads an existing
// lock JSON file and prints `formatCompatMarkdown` of it to stdout — no
// component/adapter compiling happens. Mutually exclusive with component
// names / `--all`. Used by CI to publish the freshly regenerated matrix to
// the job summary (see `.github/workflows/ci-compat.yml`).
//
// This measures COMPILE-time compatibility only, not render identity;
// rendered-output parity is owned by the adapter conformance suite
// (packages/adapter-tests) and the eval vector corpus.
//
// This package is repo-internal (`private: true`, never published) —
// unlike the removed `bf compat` command, there is no `CliContext` /
// project-config resolution here. Components are always enumerated from
// THIS repo's `ui/components/ui/`, whose location is resolved relative to
// this file's own path rather than a project config.

import { existsSync, readFileSync, writeFileSync } from 'fs'
import { glob as fsGlob } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'path'
import { loadCompatAdapters } from './adapter-registry'
import { buildCompatCell, compileForCompat, type CompatCell } from './engine'
import { buildCompatReport, buildFixtureDivergences, formatCompatJson, formatCompatMarkdown, type CompatReport } from './report'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const COMPONENTS_DIR = path.join(REPO_ROOT, 'ui/components/ui')

interface CompatTarget {
  name: string
  filePath: string
}

// Enumerate every `ui/components/ui/<name>/index.tsx` component (glob: `*/index.tsx`).
async function enumerateAllComponents(): Promise<CompatTarget[]> {
  const matched: string[] = []
  for await (const entry of fsGlob('*/index.tsx', { cwd: COMPONENTS_DIR })) {
    matched.push(entry as string)
  }
  return matched
    .map(f => path.join(COMPONENTS_DIR, f))
    .sort()
    .map(filePath => ({ name: path.basename(path.dirname(filePath)), filePath }))
}

/** Resolve a named component to `ui/components/ui/<name>/index.tsx`, or null when missing. */
function resolveNamedTarget(name: string): CompatTarget | null {
  const filePath = path.join(COMPONENTS_DIR, name, 'index.tsx')
  return existsSync(filePath) ? { name, filePath } : null
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

/**
 * Structural check that a parsed JSON value is at least shaped like a
 * `CompatReport` before handing it to `formatCompatMarkdown` — catches a
 * stale/foreign JSON file with a clear error instead of a confusing
 * formatter crash. Not a full schema validation.
 */
function looksLikeCompatReport(value: unknown): value is CompatReport {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return Array.isArray(candidate.adapters) && typeof candidate.components === 'object' && candidate.components !== null
}

/**
 * Render an existing lock JSON file (the `CompatReport` shape produced by
 * `formatCompatJson`) as Markdown — no compiling, just read + parse +
 * format. Used by `--render` and by CI to publish the freshly regenerated
 * matrix to the job summary before the drift gate runs.
 */
export function renderLockToMarkdown(lockPath: string): string {
  let raw: string
  try {
    raw = readFileSync(lockPath, 'utf-8')
  } catch {
    throw new Error(`could not read ${lockPath}`)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`could not parse ${lockPath} as JSON`)
  }

  if (!looksLikeCompatReport(parsed)) {
    throw new Error(`${lockPath} does not look like a CompatReport (expected an \`adapters\` array and a \`components\` object)`)
  }

  return formatCompatMarkdown(parsed)
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const jsonFlag = args.includes('--json')
  const all = args.includes('--all')
  // `--md` is accepted for explicitness/documentation purposes — Markdown
  // is already the non-`--json` default (report.ts only defines JSON and
  // Markdown formatters), so the flag doesn't change any branching below,
  // it's just excluded from the positional `names` list.
  const outIdx = args.indexOf('--out')
  if (outIdx !== -1 && (outIdx + 1 >= args.length || args[outIdx + 1].startsWith('--'))) {
    console.error('Error: --out requires a path argument')
    process.exit(1)
    return
  }
  const outPath = outIdx !== -1 ? args[outIdx + 1] : undefined

  const renderIdx = args.indexOf('--render')
  if (renderIdx !== -1) {
    if (renderIdx + 1 >= args.length || args[renderIdx + 1].startsWith('--')) {
      console.error('Error: --render requires a path argument')
      process.exit(1)
      return
    }
    const renderPath = args[renderIdx + 1]
    const rest = args.filter((_, i) => i !== renderIdx && i !== renderIdx + 1)
    const hasNames = rest.some(arg => !arg.startsWith('--'))
    if (all || hasNames) {
      console.error('Error: --render is mutually exclusive with component names and --all')
      process.exit(1)
      return
    }
    try {
      // formatCompatMarkdown already ends with a trailing newline — write
      // directly rather than console.log (which would add a second one)
      // so stdout is byte-identical to the formatter's output.
      process.stdout.write(renderLockToMarkdown(renderPath))
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : String(err)}`)
      process.exit(1)
      return
    }
    return
  }

  const names = args.filter((arg, i) => {
    if (arg === '--all' || arg === '--md' || arg === '--json' || arg === '--out') return false
    if (outIdx !== -1 && i === outIdx + 1) return false
    return !arg.startsWith('--')
  })

  if (!all && names.length === 0) {
    console.error('Usage: bun run compat <component...>|--all [--md] [--json] [--out <path>]  |  bun run compat --render <path>')
    process.exit(1)
    return
  }

  // Resolve every requested target up front so an unresolvable name
  // fails the whole run before any (potentially slow) compiling starts.
  const targets = new Map<string, CompatTarget>()
  if (all) {
    for (const target of await enumerateAllComponents()) {
      targets.set(target.name, target)
    }
  }

  const unresolved: string[] = []
  for (const query of names) {
    const target = resolveNamedTarget(query)
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

  // Fixture-level divergences (render honesty section, #2168): every
  // adapter's declared `conformancePins` (build-time refusals) +
  // `renderDivergences` (renders but diverges from the Hono reference),
  // published alongside the component matrix so the docs
  // compatibility-matrix page reports render-level gaps instead of
  // showing only the all-green compile story. `jsxFixtures` is imported
  // relatively (same precedent as `compat-pins.test.ts` — it isn't part
  // of adapter-tests' public export map) purely for the corpus total.
  const { jsxFixtures } = await import('../../adapter-tests/fixtures')
  const fixtureDivergences = buildFixtureDivergences(loaded, jsxFixtures.length)

  const report = buildCompatReport(cells, fixtureDivergences)
  const text = jsonFlag ? formatCompatJson(report) : formatCompatMarkdown(report)

  if (outPath) {
    const resolved = path.isAbsolute(outPath) ? outPath : path.resolve(process.cwd(), outPath)
    writeFileSync(resolved, text)
    console.error(`Wrote compat report → ${resolved}`)
  } else {
    console.log(text)
  }

  console.error(summarize(report))
}

// Only run as a script — importing this module (the cli-render test pulls
// in `renderLockToMarkdown`) must not execute `main()`, which would read
// the importer's argv and `process.exit(1)`, killing the whole test process.
if (import.meta.main) {
  await main()
}
