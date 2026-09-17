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
import type { LimitationsSection } from './limitations'

export type { FixtureEscapeState } from './escape-coverage'
export type { LimitationsSection, LimitationsSectionEntry } from './limitations'

export const COMPAT_NOTE =
  'Compile-time compatibility (compileJSX + adapter generate() diagnostics). ' +
  'NOT render identity — rendered-output parity is owned by the adapter conformance suite ' +
  'and the eval vector corpus (spec/testing.md Layer 3).'

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
 *   (from the package's `renderDivergences`).
 *
 * Either kind cites the registry limitation(s) it is an instance of
 * (`limitations`, sorted + deduped) — the docs page links each cell to
 * that entry, where the given / expected / actual description lives.
 */
export interface FixtureDivergenceCell {
  kind: 'refusal' | 'render'
  /** Diagnostic codes for refusals (sorted), e.g. `["BF101"]`. */
  codes?: string[]
  /** Registry limitation ids (`packages/adapter-tests/limitations/<id>.ts`), sorted + deduped. */
  limitations: string[]
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
  'a code led by ✗ owes no escape at all (by design), and ≠ means the fixture compiles clean but its ' +
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
  /**
   * The known-limitation registry (`packages/adapter-tests/limitations/`)
   * joined with the adapters citing each entry — see `./limitations.ts`.
   * The docs page renders it as the "Known limitations" section every
   * diagnostic / gap link on the page anchors into.
   */
  limitations: LimitationsSection
}

/**
 * Assemble the deterministic fixture-divergences section from each
 * adapter's declared `conformancePins` + `renderDivergences`, plus (#2613)
 * the escape state of every error-severity refusal that's in the
 * "loud-or-escapable" floor's domain. Sorted fixture ids, sorted adapter
 * keys within each fixture, sorted codes / limitation ids — same
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
      const limitations = [...new Set(pins.map(p => p.limitation))].sort()
      const cell: FixtureDivergenceCell = { kind: 'refusal', codes, limitations }
      if (domainFixtureIds.has(fixtureId)) {
        cell.escape = classifyFixtureEscapeState(adapter, fixtureId, corpus)
      }
      cellsOf(fixtureId).set(adapter.id, cell)
    }
    for (const [fixtureId, divergence] of Object.entries(adapter.renderDivergences)) {
      // A fixture can't be both refused and render-divergent on ONE
      // adapter — pins win if an adapter ever declares both (the render
      // skip would be unreachable in its conformance suite anyway).
      if (cellsOf(fixtureId).has(adapter.id)) continue
      cellsOf(fixtureId).set(adapter.id, { kind: 'render', limitations: [divergence.limitation] })
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
  limitations: LimitationsSection = {},
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
    adapters,
    components,
    fixtureDivergences:
      fixtureDivergences ?? { note: FIXTURE_DIVERGENCES_NOTE, totalFixtures: 0, fixtures: {} },
    limitations,
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
export const NOT_OWED_MARKER = '✗'

/**
 * The marker character for one refusal cell's escape state (`''` when
 * absent or `'debt'`). Position differs by state and is applied by the
 * caller: `ESCAPABLE_MARKER` TRAILS the works-checkmark (`✓†`), while
 * `NOT_OWED_MARKER` LEADS its code (`✗BF021`) — the by-design/tracked-debt
 * distinction is the sharpest one in the table, and a trailing mark put it
 * one small glyph away from the code it negated, where a scanning reader
 * meets it last.
 */
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
 * detail list instead), and the diagnostic code (led by `${NOT_OWED_MARKER}`
 * when the escape is declared not owed) for every other refusal. Shared
 * shape between the CLI's `--md`/`--render` output and the docs page (the
 * latter reimplements this rather than importing it — `site/core` has no
 * dependency on `@barefootjs/compat`, see `compat-matrix.tsx`'s header).
 */
export function fixtureCellText(cell: FixtureDivergenceCell | undefined): string {
  if (!cell) return '✓'
  if (cell.kind === 'render') return '≠'
  if (cell.escape?.state === 'escapable') return `✓${ESCAPABLE_MARKER}`
  // Escapable returned above, and `'debt'` marks nothing — so the only
  // marker that can reach here is `NOT_OWED_MARKER`, which leads its code.
  return `${escapeMarker(cell.escape)}${(cell.codes ?? []).join(', ')}`
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
 * joined codes otherwise — warnings prefixed `⚠`), a legend mapping
 * every code that appears to the registry limitation ids behind it, and
 * the known-limitations list itself (id, kind, title, affected adapters).
 */
export function formatCompatMarkdown(report: CompatReport): string {
  const lines: string[] = []
  lines.push(report.note)
  lines.push('')
  lines.push(`| component | ${report.adapters.join(' | ')} |`)
  lines.push(`| --- | ${report.adapters.map(() => '---').join(' | ')} |`)

  const limitationsByCode = new Map<string, Set<string>>()
  for (const name of Object.keys(report.components).sort()) {
    const row = report.components[name]
    const cellText = report.adapters.map(id => {
      const cell = row[id]
      if (!cell) return '?'
      const diagnostics = cell.diagnostics ?? []
      if (diagnostics.length === 0) return '✓'
      return diagnostics
        .map(d => {
          let set = limitationsByCode.get(d.code)
          if (!set) {
            set = new Set()
            limitationsByCode.set(d.code, set)
          }
          for (const id of d.limitations) set.add(id)
          return d.severity === 'warning' ? `⚠${d.code}` : d.code
        })
        .join(', ')
    })
    lines.push(`| ${name} | ${cellText.join(' | ')} |`)
  }

  lines.push('')
  lines.push('Legend:')
  for (const code of [...limitationsByCode.keys()].sort()) {
    const ids = [...limitationsByCode.get(code)!].sort()
    lines.push(`- \`${code}\`: ${ids.length > 0 ? ids.map(id => `\`${id}\``).join(', ') : '(no registered limitation)'}`)
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
    // Grouped by the question a reader arrives with — does this work? —
    // with the tracked half split out from the permanent one, and each
    // line led by the literal cell contents. Kept in step with the docs
    // page's legend (`site/core/pages/compat-matrix.tsx`), which this
    // table is meant to read identically to.
    lines.push('')
    lines.push(`**✓ Works** — \`✓\` as written · \`✓${ESCAPABLE_MARKER}\` with a \`/* @client */\` comment`)
    lines.push('(a verified escape twin compiles clean on that adapter).')
    lines.push('')
    lines.push('**☐ TODO** (a registered `silent` / `refusal` limitation) — `≠` compiles clean but the rendered output')
    lines.push('diverges from the Hono reference (the limitation entry it cites says what renders instead)')
    lines.push('· a bare diagnostic code means refused, no escape yet.')
    lines.push('')
    lines.push(
      `**${NOT_OWED_MARKER} Doesn't work** (by design, not a gap) — a code led by ` +
        `\`${NOT_OWED_MARKER}\` (e.g. \`${NOT_OWED_MARKER}BF021\`) is refused on purpose, no escape owed.`,
    )
  }

  // The registry itself: what each limitation IS, and where it bites.
  const limitationIds = Object.keys(report.limitations ?? {}).sort()
  if (limitationIds.length > 0) {
    lines.push('')
    lines.push('Known limitations (packages/adapter-tests/limitations/):')
    lines.push('')
    lines.push('| id | kind | title | adapters |')
    lines.push('| --- | --- | --- | --- |')
    for (const id of limitationIds) {
      const entry = report.limitations[id]
      lines.push(`| \`${id}\` | ${entry.kind} | ${entry.title} | ${entry.adapters.join(', ') || '—'} |`)
    }
  }

  return lines.join('\n') + '\n'
}
