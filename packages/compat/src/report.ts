// @barefootjs/compat — report formatters. Every function here is deterministic:
// sorted component rows, sorted adapter columns, sorted codes, LF line
// endings, trailing newline, and no timestamps / durations / absolute
// paths — the JSON form is committed as ui/compat.lock.json and CI
// gates on `git diff --exit-code` against it, so two runs over the same
// inputs must produce byte-identical output.

import type { CompatCell } from './engine'

export const COMPAT_NOTE =
  'Compile-time compatibility (compileJSX + adapter generate() diagnostics). ' +
  'NOT render identity — rendered-output parity is owned by the adapter conformance suite ' +
  'and the eval vector corpus (spec/testing.md Layer 3).'

export const KNOWN_LIMITATION_LABEL = 'https://github.com/piconic-ai/barefootjs/labels/known-limitation'

/** A `CompatCell` as it appears in the report: `diagnostics` omitted entirely when empty. */
export interface CompatReportCell {
  ok: boolean
  diagnostics?: CompatCell['diagnostics']
}

export interface CompatReport {
  note: string
  knownLimitationLabel: string
  /** Adapter ids (matrix columns): `hono` first (reference adapter), then alphabetical. */
  adapters: string[]
  /** Component name → adapter id → cell. */
  components: Record<string, Record<string, CompatReportCell>>
}

/**
 * Assemble the deterministic report shape from raw compile cells.
 * `cells` may be built in any order — this sorts component names and
 * derives the adapter column list (hono first, then alphabetical) from
 * the union of columns actually present, so a caller that only ran a
 * subset of adapters still gets a valid, ordered report.
 */
export function buildCompatReport(cells: Record<string, Record<string, CompatCell>>): CompatReport {
  const adapterIds = new Set<string>()
  for (const row of Object.values(cells)) {
    for (const id of Object.keys(row)) adapterIds.add(id)
  }
  // `hono` is the reference adapter — the conformance suite compares every
  // other adapter's render against it — so it always leads the columns;
  // the remainder stays alphabetical.
  const adapters = [...adapterIds].sort((a, b) => {
    if (a === 'hono') return b === 'hono' ? 0 : -1
    if (b === 'hono') return 1
    return a < b ? -1 : a > b ? 1 : 0
  })

  const components: CompatReport['components'] = {}
  for (const name of Object.keys(cells).sort()) {
    const row: Record<string, CompatReportCell> = {}
    for (const id of adapters) {
      const cell = cells[name][id]
      if (!cell) continue
      row[id] = cell.diagnostics.length > 0 ? { ok: cell.ok, diagnostics: cell.diagnostics } : { ok: cell.ok }
    }
    components[name] = row
  }

  return { note: COMPAT_NOTE, knownLimitationLabel: KNOWN_LIMITATION_LABEL, adapters, components }
}

/** Lock-file JSON: 2-space indent, trailing newline. */
export function formatCompatJson(report: CompatReport): string {
  return JSON.stringify(report, null, 2) + '\n'
}

/**
 * Markdown matrix: boundary note, `component × adapter` table (✓ for a
 * clean cell, `?` for a missing cell — never rendered as success, comma-
 * joined codes otherwise — warnings prefixed `⚠`), and a legend mapping
 * every code that appears to its known-limitation issue URLs (falling
 * back to the label URL when a code has none).
 */
export function formatCompatMarkdown(report: CompatReport): string {
  const lines: string[] = []
  lines.push(report.note)
  lines.push('')
  lines.push(`| component | ${report.adapters.join(' | ')} |`)
  lines.push(`| --- | ${report.adapters.map(() => '---').join(' | ')} |`)

  const issuesByCode = new Map<string, Set<string>>()
  for (const name of Object.keys(report.components).sort()) {
    const row = report.components[name]
    const cellText = report.adapters.map(id => {
      const cell = row[id]
      if (!cell) return '?'
      const diagnostics = cell.diagnostics ?? []
      if (diagnostics.length === 0) return '✓'
      return diagnostics
        .map(d => {
          let set = issuesByCode.get(d.code)
          if (!set) {
            set = new Set()
            issuesByCode.set(d.code, set)
          }
          for (const url of d.issues) set.add(url)
          return d.severity === 'warning' ? `⚠${d.code}` : d.code
        })
        .join(', ')
    })
    lines.push(`| ${name} | ${cellText.join(' | ')} |`)
  }

  lines.push('')
  lines.push('Legend:')
  for (const code of [...issuesByCode.keys()].sort()) {
    const urls = [...issuesByCode.get(code)!].sort()
    lines.push(`- \`${code}\`: ${urls.length > 0 ? urls.join(', ') : report.knownLimitationLabel}`)
  }

  return lines.join('\n') + '\n'
}
