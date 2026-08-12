// @barefootjs/compat — report formatters. Every function here is deterministic:
// sorted component rows, sorted adapter columns, sorted codes, LF line
// endings, trailing newline, and no timestamps / durations / absolute
// paths — the JSON form is committed as ui/compat.lock.json and CI
// gates on `git diff --exit-code` against it, so two runs over the same
// inputs must produce byte-identical output.

import type { LoadedCompatAdapter } from './adapter-registry'
import type { CompatCell } from './engine'
import { classifyFixtureEscapeState, computeDomainFixtureIds, computeHonoErrorPinnedFixtures, type FixtureEscapeState } from './escape-coverage'
import type { JSXFixture } from '../../adapter-tests/src/types'

export type { FixtureEscapeState } from './escape-coverage'

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
  /**
   * Set only on `'refusal'` cells with an error-severity pin that's IN the
   * "loud-or-escapable" floor's domain (`computeDomainFixtureIds` —
   * excludes fixtures the reference adapter itself refuses, a compiler-wide
   * bug rather than an adapter-specific gap). Distinguishes a refusal with
   * a verified working escape (`'escapable'`) from one that's still tracked
   * debt (`'debt'`) or that owes no escape at all, by design
   * (`'not-owed'`) — see `FixtureEscapeState` (`./escape-coverage.ts`) and
   * #2613. Absent for warning-only refusals and every `'render'`-kind cell,
   * where the concept doesn't apply.
   */
  escape?: FixtureEscapeState
}

export const FIXTURE_DIVERGENCES_NOTE =
  'Render-conformance section: the shared conformance corpus (packages/adapter-tests) is rendered ' +
  'through every adapter’s REAL backend and byte-compared against the Hono reference. This answers, per ' +
  'fixture and per adapter, whether the construct WORKS — not just whether it compiles. A construct works ' +
  'either as written (✓) or with a documented `/* @client */` comment (✓†, a verified, supported escape — ' +
  'most refusals have one). Fixtures absent from the table below work on every adapter — most as written, ' +
  'some via that documented escape; the headline says how many of each. ' +
  'Listed fixtures need attention somewhere: a bare diagnostic code is still-open debt with no escape yet, ' +
  'a code marked ‡ owes no escape at all (by design), and ≠ means the fixture compiles clean but its ' +
  'rendered output diverges from the reference.'

/** A fixture-corpus row's human-readable description + link to its source file. */
export interface FixtureDoc {
  description: string
  url: string
}

export interface FixtureDivergences {
  note: string
  /** Total shared-corpus fixture count, for the "N of M clean" summary. */
  totalFixtures: number
  /** Fixture id → adapter id → divergence cell. Clean cells are omitted. */
  fixtures: Record<string, Record<string, FixtureDivergenceCell>>
  /**
   * Fixture id → description + source link, for the divergent fixtures
   * listed above. Populated by the CLI at generation time (see
   * `component-docs.ts`); absent on reports built without it (the pure
   * `buildFixtureDivergences` leaves it unset).
   */
  docs?: Record<string, FixtureDoc>
}

/** A component-matrix row's title, description, and links. */
export interface ComponentDoc {
  title: string
  description: string
  /** GitHub link to the component source (`ui/components/ui/<name>/index.tsx`). */
  url: string
  /**
   * Public component-reference page on ui.barefootjs.dev, when the
   * component has a routed `/components/<name>` page. Absent for
   * components with no public page (`chart`, `icon`, `sidebar`, `slot`,
   * `xyflow`), which link to `url` instead.
   */
  uiUrl?: string
}

export interface CompatReport {
  note: string
  knownLimitationLabel: string
  /** Adapter ids (matrix columns): `hono` first (reference adapter), then alphabetical. */
  adapters: string[]
  /** Component name → adapter id → cell. */
  components: Record<string, Record<string, CompatReportCell>>
  /**
   * Component name → title + description + source link. Populated by the
   * CLI at generation time (see `component-docs.ts`); absent on reports
   * built without it (the pure `buildCompatReport` leaves it unset).
   */
  componentDocs?: Record<string, ComponentDoc>
  /** Fixture-level divergences (build-time refusals + render divergences). */
  fixtureDivergences: FixtureDivergences
}

/**
 * Assemble the deterministic fixture-divergences section from each
 * adapter's declared `conformancePins` + `renderDivergences`, plus (#2613)
 * the escape state of every error-severity refusal that's in the
 * "loud-or-escapable" floor's domain. Sorted fixture ids, sorted adapter
 * keys within each fixture, sorted codes / issue URLs — same
 * byte-stability contract as the component matrix.
 *
 * `corpus` is the full shared fixture corpus (`jsxFixtures`) — needed to read
 * `escapeNotOwed` / `escapes` declarations and to compile escape twins via
 * `classifyFixtureEscapeState`, which is why this function is no longer a
 * cheap dictionary-only join (see that function's own docstring for why a
 * non-ok floor-test outcome throws here instead of guessing).
 */
export function buildFixtureDivergences(
  adapters: ReadonlyArray<LoadedCompatAdapter>,
  totalFixtures: number,
  corpus: readonly JSXFixture[],
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

  const honoErrorPinned = computeHonoErrorPinnedFixtures(adapters)

  for (const adapter of adapters) {
    const domainFixtureIds = new Set(computeDomainFixtureIds(adapter, honoErrorPinned))
    for (const [fixtureId, pins] of Object.entries(adapter.pins)) {
      const codes = [...new Set(pins.map(p => p.code))].sort()
      const issues = [...new Set(pins.flatMap(p => (p.issue ? [p.issue] : [])))].sort()
      const cell: FixtureDivergenceCell = { kind: 'refusal', codes }
      if (issues.length > 0) cell.issues = issues
      if (domainFixtureIds.has(fixtureId)) {
        cell.escape = classifyFixtureEscapeState(adapter, fixtureId, corpus)
      }
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
 * The two markers that make a refusal's escape state legible in a wide
 * GFM table, without a 10th adapter column or a per-occurrence footnote
 * (#2613's "escape visibility", re-worked so the check mark answers "does
 * it work?" first — see `site/core/pages/compat-matrix.tsx` for the fuller
 * rationale, mirrored here so the CLI's own `--md` / `--render` output —
 * the CI job-summary path — reads the same way as the docs page).
 * `ESCAPABLE_MARKER` decorates the WORKS checkmark (`✓†`) — the fixture
 * works, given a `/* @client *\/` comment — not the diagnostic code, which
 * moves out of the cell entirely once a working escape exists. A `'debt'`
 * cell is deliberately unmarked: a bare `BF101` means refused, no escape
 * yet.
 */
export const ESCAPABLE_MARKER = '†'
export const NOT_OWED_MARKER = '‡'

/** The marker suffix for one refusal cell's escape state (`''` when absent or `'debt'`). */
export function escapeMarker(escape: FixtureEscapeState | undefined): string {
  if (!escape) return ''
  if (escape.state === 'escapable') return ESCAPABLE_MARKER
  if (escape.state === 'not-owed') return NOT_OWED_MARKER
  return ''
}

/**
 * One fixture-divergence cell rendered for the table: `✓` for a clean
 * (absent) cell, `≠` for a render divergence, `✓${ESCAPABLE_MARKER}` for a
 * refusal with a verified working escape (the fixture WORKS, with a
 * `/* @client *\/` comment — no diagnostic code shown, since nothing is
 * actually broken here; the code it suppresses lives in the per-fixture
 * detail list instead), and the diagnostic code (plus `${NOT_OWED_MARKER}`
 * when the escape is declared not owed) for every other refusal. Shared
 * shape between the CLI's `--md`/`--render` output and the docs page (the
 * latter reimplements this rather than importing it — `site/core` has no
 * dependency on `@barefootjs/compat`, see `compat-matrix.tsx`'s header).
 */
export function fixtureCellText(cell: FixtureDivergenceCell | undefined): string {
  if (!cell) return '✓'
  if (cell.kind === 'render') return '≠'
  if (cell.escape?.state === 'escapable') return `✓${ESCAPABLE_MARKER}`
  return `${(cell.codes ?? []).join(', ')}${escapeMarker(cell.escape)}`
}

/**
 * True when every adapter cell present on this fixture's row is a refusal
 * with a verified working escape — the fixture works on every adapter,
 * either as written or with a documented `/* @client *\/` comment, so it
 * doesn't belong in the "needs attention" table. A `'render'`-kind cell, a
 * `'debt'`/`'not-owed'` refusal, or a refusal outside the escape-coverage
 * domain (no `escape` field at all — e.g. the compiler-wide `BF021`
 * refusal on `date-method-uncatalogued`, which even the Hono reference
 * can't escape) all count as "needs attention".
 */
export function rowWorksEverywhere(row: Record<string, FixtureDivergenceCell>): boolean {
  return Object.values(row).every(cell => cell.kind === 'refusal' && cell.escape?.state === 'escapable')
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

  // Fixture-level render conformance. Rendered only when the report
  // carries entries — the table lists only fixtures that NEED ATTENTION
  // (at least one adapter with no working path); a fixture refused
  // everywhere it's refused but with a verified escape on every one of
  // those adapters WORKS everywhere and is folded into the headline count
  // instead (`rowWorksEverywhere`), not shown as a row.
  const allFixtureIds = Object.keys(report.fixtureDivergences?.fixtures ?? {})
  if (allFixtureIds.length > 0) {
    const fd = report.fixtureDivergences
    const fullyEscapableIds = allFixtureIds.filter(id => rowWorksEverywhere(fd.fixtures[id]))
    const needsAttentionIds = allFixtureIds.filter(id => !rowWorksEverywhere(fd.fixtures[id])).sort()
    const cleanCount = fd.totalFixtures - allFixtureIds.length
    const worksEverywhereCount = cleanCount + fullyEscapableIds.length

    lines.push('')
    lines.push('Fixture render conformance (conformance corpus):')
    lines.push('')
    lines.push(fd.note)
    lines.push('')
    lines.push(
      `${worksEverywhereCount} of ${fd.totalFixtures} fixtures work on every adapter ` +
        `(${fullyEscapableIds.length} of those need a \`/* @client */\` comment on at least one adapter). ` +
        `${needsAttentionIds.length} need attention:`,
    )
    lines.push('')
    lines.push(`| fixture | ${report.adapters.join(' | ')} |`)
    lines.push(`| --- | ${report.adapters.map(() => '---').join(' | ')} |`)
    for (const fixtureId of needsAttentionIds) {
      const row = fd.fixtures[fixtureId]
      const cellText = report.adapters.map(id => fixtureCellText(row[id]))
      lines.push(`| ${fixtureId} | ${cellText.join(' | ')} |`)
    }
    lines.push('')
    lines.push('`✓` works as written · `✓†` works, but needs a `/* @client */` comment (a verified escape')
    lines.push('twin compiles clean on that adapter) · `≠` compiles clean but the rendered output diverges')
    lines.push('from the Hono reference (see each adapter package’s `render-divergences.ts` for the')
    lines.push('per-fixture rationale) · a bare diagnostic code means refused, no escape yet (tracked debt) ·')
    lines.push('`‡` after a code means refused, no escape owed, by design.')
  }

  return lines.join('\n') + '\n'
}
