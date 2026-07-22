// @barefootjs/compat — construct support matrix (`kind × axis × adapter`).
//
// Mirrors the compat.lock.json pipeline (packages/compat/src/report.ts +
// cli.ts) but answers a different question: not "does this whole
// COMPONENT compile clean on adapter A" but "of the fixtures that
// exercise construct C (a ParsedExpr kind, or a finer-grained axis like
// `binary:===`), how many are clean on adapter A".
//
// IMPORTANT — attribution semantics (why this isn't a binary pass/fail):
// `ConformancePins` / `RenderDivergences` are FIXTURE-granular — a pin
// says "fixture X is gapped on adapter A", not "construct C is gapped on
// adapter A". A gapped fixture is usually a complex component that
// incidentally exercises many common kinds/axes alongside the one
// construct it exists to pin down. So attributing a gap to every
// construct the fixture happens to touch would make nearly every common
// construct (identifier, literal:string, ...) look broken on every
// adapter, when in reality only one fixture's specific shape is pinned.
// The fix is to report a RATIO (`pass / total` covering fixtures) plus a
// `gaps` drill-down naming exactly which fixtures are gapped and which
// tracking issues cover them — never collapse that back into a binary
// per-cell verdict.
//
// Denominators come from `packages/adapter-tests/coverage-map.json` (the
// committed kind/axis/fixture ledger — see that package's
// `src/coverage-map.ts` for how it's computed and its own freshness
// gate). Numerators come from `loadCompatAdapters()` (the same registry
// `report.ts`/`cli.ts` use for the component matrix).

import { PARSED_EXPR_KINDS } from '@barefootjs/jsx'
import coverageMapJson from '../../adapter-tests/coverage-map.json' with { type: 'json' }
import { loadCompatAdapters } from './adapter-registry'
import { computeConstructExamples, type ConstructExample } from './construct-examples'
import { computeConstructSourceLinks, resolveAxisLink, resolveKindLink, type SourceLink } from './construct-source-links'
import { compareAdapterIds, KNOWN_LIMITATION_LABEL } from './report'

export const SUPPORT_MATRIX_NOTE =
  'Construct-level support, derived from the same fixture-granular conformancePins/renderDivergences as ' +
  'the compat matrix. Pins are attributed to a FIXTURE, not to a construct — a gapped fixture is usually a ' +
  'complex component that incidentally exercises many common kinds/axes alongside the one shape it exists ' +
  'to pin down. Read each cell as a pass/total RATIO over the fixtures that exercise that construct, never ' +
  'as a binary verdict: a construct can show a healthy ratio (e.g. 250/253) with a handful of gapped ' +
  'fixtures — those are real, just narrow. Per-fixture detail for a gap lives in the `gaps` array (and in ' +
  'the full compat matrix, ui/compat.lock.json); the known-limitation label below is the per-issue source ' +
  'of truth for anything without a linked tracking issue.'

/** Minimal shape read from `packages/adapter-tests/coverage-map.json`. */
export interface SupportMatrixCoverageMap {
  fixtures: Record<string, { kinds: readonly string[]; axes: readonly string[] }>
  kindCounts: Record<string, number>
  axisCounts: Record<string, number>
  uncoveredKinds: readonly string[]
}

/** The subset of `LoadedCompatAdapter` the join needs — kept narrow for the unit test's synthetic fixtures. */
export interface SupportMatrixAdapterInput {
  id: string
  pins: Record<string, ReadonlyArray<{ code: string; severity: 'error' | 'warning'; issue?: string }>>
  renderDivergences: Record<string, string>
}

/** One fixture gapped on one adapter for one construct, with its (deduped, sorted) tracking-issue URLs. */
export interface SupportMatrixGap {
  fixture: string
  issues: string[]
}

/** `pass`/`total` over the fixtures that exercise this construct on this adapter; `gaps` omitted when empty. */
export interface SupportMatrixCell {
  pass: number
  total: number
  gaps?: SupportMatrixGap[]
}

/** One construct's (kind or axis) total covering-fixture count and its per-adapter cells. */
export interface SupportMatrixConstruct {
  total: number
  cells: Record<string, SupportMatrixCell>
  /** GitHub permalink to where this construct is recognised, when resolvable (see `construct-source-links.ts`). */
  source?: SourceLink
  /** Exemplar covering fixture — what the case looks like (see `construct-examples.ts`). */
  example?: ConstructExample
}

export interface SupportMatrixReport {
  note: string
  knownLimitationLabel: string
  /** Adapter ids (matrix columns): `hono` first (reference adapter), then alphabetical. */
  adapters: string[]
  kinds: Record<string, SupportMatrixConstruct>
  axes: Record<string, SupportMatrixConstruct>
}

const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** Fixture ids (sorted) whose coverage-map entry lists `construct` in the given field. */
function coveringFixtureIds(
  coverage: SupportMatrixCoverageMap,
  construct: string,
  field: 'kinds' | 'axes',
): string[] {
  const ids: string[] = []
  for (const fixtureId of Object.keys(coverage.fixtures)) {
    if (coverage.fixtures[fixtureId][field].includes(construct)) ids.push(fixtureId)
  }
  return ids.sort(byCodeUnit)
}

/**
 * A fixture is "gapped" on an adapter when its id is a key of that
 * adapter's `pins` (compile-time refusal) OR `renderDivergences`
 * (render-level divergence) — the same union `report.ts`'s
 * `buildFixtureDivergences` uses for the render-honesty section. Issues
 * are the pinned diagnostics' `issue` URLs (dedup+sorted); a
 * render-divergence-only gap carries no issue URL (that map has no
 * `issue` field), so `issues` is `[]` in that case.
 */
function gapsFor(coveringIds: string[], adapter: SupportMatrixAdapterInput): SupportMatrixGap[] {
  const gaps: SupportMatrixGap[] = []
  for (const fixtureId of coveringIds) {
    const pins = adapter.pins[fixtureId]
    const isDivergent = fixtureId in adapter.renderDivergences
    if (!pins && !isDivergent) continue
    const issues = pins ? [...new Set(pins.flatMap(p => (p.issue ? [p.issue] : [])))].sort(byCodeUnit) : []
    gaps.push({ fixture: fixtureId, issues })
  }
  return gaps
}

function buildCell(coveringIds: string[], adapter: SupportMatrixAdapterInput): SupportMatrixCell {
  const gaps = gapsFor(coveringIds, adapter)
  const cell: SupportMatrixCell = { pass: coveringIds.length - gaps.length, total: coveringIds.length }
  if (gaps.length > 0) cell.gaps = gaps
  return cell
}

function buildConstruct(
  coverage: SupportMatrixCoverageMap,
  construct: string,
  field: 'kinds' | 'axes',
  adapterIds: string[],
  adapterById: Map<string, SupportMatrixAdapterInput>,
): SupportMatrixConstruct {
  const coveringIds = coveringFixtureIds(coverage, construct, field)
  const cells: Record<string, SupportMatrixCell> = {}
  for (const adapterId of adapterIds) {
    cells[adapterId] = buildCell(coveringIds, adapterById.get(adapterId)!)
  }
  return { total: coveringIds.length, cells }
}

/**
 * Pure join: `coverage-map.json` (denominators) × adapter pins/render-
 * divergences (numerators) → the `SupportMatrixReport` shape. Separated
 * from `computeSupportMatrix` (which supplies the real committed
 * coverage map + `loadCompatAdapters()`) so the unit test can pin the
 * join logic against small synthetic input without depending on the
 * real fixture corpus or built adapter packages.
 *
 * Kinds are every entry in `PARSED_EXPR_KINDS` (the full compiler-side
 * registry, sorted) — including kinds with zero covering fixtures (e.g.
 * `regex`, `coverage.uncoveredKinds`), so the matrix stays complete
 * against the registry rather than silently dropping uncovered rows.
 * Axes are every key of `coverage.axisCounts` (there's no equivalent
 * "uncovered axis" registry to complete against).
 */
export function buildSupportMatrix(
  coverage: SupportMatrixCoverageMap,
  adapters: ReadonlyArray<SupportMatrixAdapterInput>,
): SupportMatrixReport {
  const adapterIds = adapters.map(a => a.id).sort(compareAdapterIds)
  const adapterById = new Map(adapters.map(a => [a.id, a]))

  const kinds: Record<string, SupportMatrixConstruct> = {}
  for (const kind of [...PARSED_EXPR_KINDS].sort(byCodeUnit)) {
    kinds[kind] = buildConstruct(coverage, kind, 'kinds', adapterIds, adapterById)
  }

  const axes: Record<string, SupportMatrixConstruct> = {}
  for (const axis of Object.keys(coverage.axisCounts).sort(byCodeUnit)) {
    axes[axis] = buildConstruct(coverage, axis, 'axes', adapterIds, adapterById)
  }

  return {
    note: SUPPORT_MATRIX_NOTE,
    knownLimitationLabel: KNOWN_LIMITATION_LABEL,
    adapters: adapterIds,
    kinds,
    axes,
  }
}

/**
 * Real-input entry point: the committed `coverage-map.json` joined
 * against every adapter `loadCompatAdapters()` resolves. Adapters it
 * can't resolve are silently skipped (same degrade-to-skip contract as
 * `loadCompatAdapters` itself) — the monorepo always has all 9
 * installed, so a run from this repo covers every adapter.
 */
export async function computeSupportMatrix(): Promise<SupportMatrixReport> {
  const { loaded } = await loadCompatAdapters()
  const coverage = coverageMapJson as SupportMatrixCoverageMap
  const report = buildSupportMatrix(coverage, loaded)
  return attachConstructDocs(report, coverage)
}

/**
 * Attaches to every resolvable kind/axis row a `source` definition
 * permalink and an `example` exemplar fixture (id + description +
 * fixture-file permalink). Kept separate from `buildSupportMatrix`
 * (which stays a pure join over caller-supplied data, per its unit
 * test's synthetic fixtures/adapters) since this reads real source
 * files off disk — there is nothing meaningful to resolve against a
 * synthetic coverage map.
 */
function attachConstructDocs(report: SupportMatrixReport, coverage: SupportMatrixCoverageMap): SupportMatrixReport {
  const links = computeConstructSourceLinks()
  const examples = computeConstructExamples(coverage)
  for (const [kind, construct] of Object.entries(report.kinds)) {
    const source = resolveKindLink(kind, links)
    if (source) construct.source = source
    const example = examples.kinds[kind]
    if (example) construct.example = example
  }
  for (const [axis, construct] of Object.entries(report.axes)) {
    const source = resolveAxisLink(axis, links)
    if (source) construct.source = source
    const example = examples.axes[axis]
    if (example) construct.example = example
  }
  return report
}

/** Lock-file JSON: 2-space indent, trailing newline — same contract as `formatCompatJson`. */
export function formatSupportMatrixJson(report: SupportMatrixReport): string {
  return JSON.stringify(report, null, 2) + '\n'
}
