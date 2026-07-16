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

/**
 * The compat determinism contract's adapter-column ordering: `hono`
 * (the reference adapter) always leads, the remainder sorts alphabetically
 * by code-unit (never `localeCompare` — see the module docstring). Shared
 * by `buildCompatReport` and `packages/compat/src/support-matrix.ts` so
 * both committed lockfiles agree on column order.
 */
export function compareAdapterIds(a: string, b: string): number {
  if (a === 'hono') return b === 'hono' ? 0 : -1
  if (b === 'hono') return 1
  return a < b ? -1 : a > b ? 1 : 0
}

/** A `CompatCell` as it appears in the report: `diagnostics` omitted entirely when empty. */
export interface CompatReportCell {
  ok: boolean
  diagnostics?: CompatCell['diagnostics']
}

/**
 * One fixture × adapter divergence cell in the fixture-divergences
 * section. Two kinds:
 *
 * - `'refusal'` — the adapter refuses the shape at BUILD time with the
 *   listed diagnostic codes (from the package's `conformancePins`).
 * - `'render'` — the fixture COMPILES clean but its rendered output
 *   diverges from the Hono reference on the adapter's real backend
 *   (from the package's `renderDivergences`); `reason` is the
 *   one-line description.
 */
export interface FixtureDivergenceCell {
  kind: 'refusal' | 'render'
  /** Diagnostic codes for refusals (sorted), e.g. `["BF101"]`. */
  codes?: string[]
  /** Known-limitation issue URLs for refusals (sorted, deduped). */
  issues?: string[]
  /** One-line divergence description for render-kind cells. */
  reason?: string
}

export const FIXTURE_DIVERGENCES_NOTE =
  'Render-level honesty section: the shared conformance corpus (packages/adapter-tests) is rendered ' +
  'through every adapter’s REAL backend and byte-compared against the Hono reference. Fixtures listed ' +
  'here diverge on at least one adapter — either refused loudly at build time (conformancePins) or ' +
  'rendering differently from the reference (renderDivergences, skipped in that adapter’s conformance ' +
  'suite until fixed). Fixtures absent from this table render to reference parity on every adapter.'

export interface FixtureDivergences {
  note: string
  /** Total shared-corpus fixture count, for the "N of M clean" summary. */
  totalFixtures: number
  /** Fixture id → adapter id → divergence cell. Clean cells are omitted. */
  fixtures: Record<string, Record<string, FixtureDivergenceCell>>
}

export interface CompatReport {
  note: string
  knownLimitationLabel: string
  /** Adapter ids (matrix columns): `hono` first (reference adapter), then alphabetical. */
  adapters: string[]
  /** Component name → adapter id → cell. */
  components: Record<string, Record<string, CompatReportCell>>
  /** Fixture-level divergences (build-time refusals + render divergences). */
  fixtureDivergences: FixtureDivergences
}

/**
 * Assemble the deterministic fixture-divergences section from each
 * adapter's declared `conformancePins` + `renderDivergences`. Sorted
 * fixture ids, sorted adapter keys within each fixture, sorted codes /
 * issue URLs — same byte-stability contract as the component matrix.
 */
export function buildFixtureDivergences(
  adapters: ReadonlyArray<{
    id: string
    pins: Record<string, ReadonlyArray<{ code: string; severity: 'error' | 'warning'; issue?: string }>>
    renderDivergences: Record<string, string>
  }>,
  totalFixtures: number,
): FixtureDivergences {
  const byFixture = new Map<string, Map<string, FixtureDivergenceCell>>()
  const cellsOf = (fixtureId: string): Map<string, FixtureDivergenceCell> => {
    let m = byFixture.get(fixtureId)
    if (!m) {
      m = new Map()
      byFixture.set(fixtureId, m)
    }
    return m
  }

  for (const adapter of adapters) {
    for (const [fixtureId, pins] of Object.entries(adapter.pins)) {
      const codes = [...new Set(pins.map(p => p.code))].sort()
      const issues = [...new Set(pins.flatMap(p => (p.issue ? [p.issue] : [])))].sort()
      const cell: FixtureDivergenceCell = { kind: 'refusal', codes }
      if (issues.length > 0) cell.issues = issues
      cellsOf(fixtureId).set(adapter.id, cell)
    }
    for (const [fixtureId, reason] of Object.entries(adapter.renderDivergences)) {
      // A fixture can't be both refused and render-divergent on ONE
      // adapter — pins win if an adapter ever declares both (the render
      // skip would be unreachable in its conformance suite anyway).
      if (cellsOf(fixtureId).has(adapter.id)) continue
      cellsOf(fixtureId).set(adapter.id, { kind: 'render', reason })
    }
  }

  const fixtures: FixtureDivergences['fixtures'] = {}
  for (const fixtureId of [...byFixture.keys()].sort()) {
    const row: Record<string, FixtureDivergenceCell> = {}
    const cells = byFixture.get(fixtureId)!
    for (const adapterId of [...cells.keys()].sort()) {
      row[adapterId] = cells.get(adapterId)!
    }
    fixtures[fixtureId] = row
  }

  return { note: FIXTURE_DIVERGENCES_NOTE, totalFixtures, fixtures }
}

/**
 * Assemble the deterministic report shape from raw compile cells.
 * `cells` may be built in any order — this sorts component names and
 * derives the adapter column list (hono first, then alphabetical) from
 * the union of columns actually present, so a caller that only ran a
 * subset of adapters still gets a valid, ordered report.
 */
export function buildCompatReport(
  cells: Record<string, Record<string, CompatCell>>,
  fixtureDivergences?: FixtureDivergences,
): CompatReport {
  const adapterIds = new Set<string>()
  for (const row of Object.values(cells)) {
    for (const id of Object.keys(row)) adapterIds.add(id)
  }
  // `hono` is the reference adapter — the conformance suite compares every
  // other adapter's render against it — so it always leads the columns;
  // the remainder stays alphabetical.
  const adapters = [...adapterIds].sort(compareAdapterIds)

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

  return {
    note: COMPAT_NOTE,
    knownLimitationLabel: KNOWN_LIMITATION_LABEL,
    adapters,
    components,
    fixtureDivergences:
      fixtureDivergences ?? { note: FIXTURE_DIVERGENCES_NOTE, totalFixtures: 0, fixtures: {} },
  }
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

  // Fixture-level divergences (render honesty section). Rendered only
  // when the report carries entries — the section is keyed by fixture,
  // with each adapter's refusal codes or a `≠` render-divergence marker.
  const fixtureIds = Object.keys(report.fixtureDivergences?.fixtures ?? {})
  if (fixtureIds.length > 0) {
    const fd = report.fixtureDivergences
    lines.push('')
    lines.push('Fixture divergences (conformance corpus):')
    lines.push('')
    lines.push(fd.note)
    lines.push('')
    lines.push(`${fixtureIds.length} of ${fd.totalFixtures} fixtures diverge on at least one adapter.`)
    lines.push('')
    lines.push(`| fixture | ${report.adapters.join(' | ')} |`)
    lines.push(`| --- | ${report.adapters.map(() => '---').join(' | ')} |`)
    for (const fixtureId of fixtureIds.sort()) {
      const row = fd.fixtures[fixtureId]
      const cellText = report.adapters.map(id => {
        const cell = row[id]
        if (!cell) return '✓'
        return cell.kind === 'refusal' ? (cell.codes ?? []).join(', ') : '≠'
      })
      lines.push(`| ${fixtureId} | ${cellText.join(' | ')} |`)
    }
    lines.push('')
    lines.push('`≠` = compiles clean but the rendered output diverges from the Hono reference')
    lines.push('(see each adapter package’s `render-divergences.ts` for the per-fixture rationale).')
  }

  return lines.join('\n') + '\n'
}
