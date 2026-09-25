// @barefootjs/compat — the known-limitations section of `ui/compat.lock.json`.
//
// The registry (`packages/adapter-tests/limitations/`) declares WHAT each
// limitation is; the adapters' `conformancePins` / `renderDivergences`
// declare WHERE it bites, and so do the real-browser e2e quarantine
// ledgers (`packages/adapter-tests/e2e/*-quarantine.ts`) for a gap only a
// hydrated page shows. This module joins them into the deterministic shape
// the docs compatibility-matrix page renders as its "Known limitations"
// section and anchors every diagnostic link on: one entry per registry id,
// with the affected adapters DERIVED from the pins and quarantine rows that
// cite it (see `adaptersCiting`) — never declared on the entry (an entry
// names no adapter, by rule).

import type { ConformancePins, RenderDivergences } from '@barefootjs/jsx'
import { limitationActual, limitationDiagnostics, type Limitation, type LimitationKind } from '../../adapter-tests/src/limitations'
import { compareAdapterIds } from './report'

/** One registry entry as published in the lock, plus the adapters whose pins cite it. */
export interface LimitationsSectionEntry {
  title: string
  kind: LimitationKind
  given: string
  expected: string
  /** Declared for `silent`; rendered from `diagnostic` for `refusal` / `by-design`. */
  actual: string
  /** Sorted diagnostic codes; absent for `silent`. */
  diagnostics?: string[]
  /** `by-design` only. */
  reason?: string
  /** The entry's declared minimal reproductions (sorted). */
  fixtures: string[]
  /** Adapter ids affected, derived from the pins, render divergences and e2e quarantine rows citing this limitation (`hono` first, then alphabetical). */
  adapters: string[]
}

/** Registry id → published entry, keys sorted. */
export type LimitationsSection = Record<string, LimitationsSectionEntry>

/** The subset of a loaded adapter the join reads — narrow so a synthetic test can build it. */
export interface LimitationsAdapterInput {
  id: string
  pins: ConformancePins
  renderDivergences: RenderDivergences
}

/**
 * One e2e quarantine row's citation: the SSR adapter of the quarantined
 * run, the limitation it cites, and — for a row keyed by a corpus fixture
 * (oracle / fixture-hydrate) — that fixture.
 */
export interface E2eCitation {
  adapter: string
  limitation: string
  fixture?: string
}

/**
 * Every limitation citation in the real-browser e2e quarantine ledgers.
 * Those harnesses serve the Hono reference's SSR HTML and hydrate it with
 * the client runtime, so a row observes the gap on `hono`; only the
 * exploration ledger's adapter-axis rows name another SSR adapter.
 */
export async function e2eQuarantineCitations(): Promise<E2eCitation[]> {
  const [{ ORACLE_QUARANTINE }, { FIXTURE_HYDRATE_QUARANTINE }, { MUTATION_QUARANTINE }, { PAIRWISE_QUARANTINE }, { EXPLORE_QUARANTINE }] =
    await Promise.all([
      import('../../adapter-tests/e2e/oracle-quarantine'),
      import('../../adapter-tests/e2e/fixture-hydrate-quarantine'),
      import('../../adapter-tests/e2e/mutation-quarantine'),
      import('../../adapter-tests/e2e/pairwise-quarantine'),
      import('../../adapter-tests/e2e/explore-quarantine'),
    ])
  const fixtureRows = [...Object.entries(ORACLE_QUARANTINE), ...Object.entries(FIXTURE_HYDRATE_QUARANTINE)].flatMap(
    ([fixture, row]) => (row.limitation ? [{ adapter: 'hono', limitation: row.limitation, fixture }] : []),
  )
  const generatedRows: ReadonlyArray<{ adapter?: string; limitation?: string }> = [
    ...MUTATION_QUARANTINE.values(),
    ...PAIRWISE_QUARANTINE.values(),
    ...EXPLORE_QUARANTINE.values(),
  ]
  return [
    ...fixtureRows,
    ...generatedRows.flatMap(row => (row.limitation ? [{ adapter: row.adapter ?? 'hono', limitation: row.limitation }] : [])),
  ]
}

/**
 * Adapter ids affected by `limitationId`: every adapter whose pins or render
 * divergences cite it, plus, for each e2e quarantine row citing it, the
 * run's SSR adapter. A row keyed by a corpus fixture also covers every
 * adapter that renders that fixture exactly as the reference does (no pin
 * and no render divergence on it): that adapter serves the same markup and
 * hydrates it with the same client runtime, so it shows the same gap. An
 * adapter with a pin on the fixture never renders it; one with a render
 * divergence (citing any limitation) serves different markup, so the row
 * does not establish the gap there either — it is left out rather than
 * claimed. A generated case (mutation / pairwise / explore) has no
 * per-adapter conformance record, so it covers only the run's own adapter.
 */
export function adaptersCiting(
  limitationId: string,
  adapters: ReadonlyArray<LimitationsAdapterInput>,
  e2eCitations: ReadonlyArray<E2eCitation>,
): string[] {
  const ids = new Set<string>()
  for (const adapter of adapters) {
    const pinned = Object.values(adapter.pins).some(pins => pins.some(p => p.limitation === limitationId))
    const divergent = Object.values(adapter.renderDivergences).some(d => d.limitation === limitationId)
    if (pinned || divergent) ids.add(adapter.id)
  }
  for (const citation of e2eCitations) {
    if (citation.limitation !== limitationId) continue
    ids.add(citation.adapter)
    const fixture = citation.fixture
    if (fixture === undefined) continue
    for (const adapter of adapters) {
      const rendersAsReference = (adapter.pins[fixture] ?? []).length === 0 && !adapter.renderDivergences[fixture]
      if (rendersAsReference) ids.add(adapter.id)
    }
  }
  return [...ids].sort(compareAdapterIds)
}

export function buildLimitationsSection(
  registry: readonly Limitation[],
  adapters: ReadonlyArray<LimitationsAdapterInput>,
  e2eCitations: ReadonlyArray<E2eCitation>,
): LimitationsSection {
  const section: LimitationsSection = {}
  for (const entry of [...registry].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    const published: LimitationsSectionEntry = {
      title: entry.title,
      kind: entry.kind,
      given: entry.given,
      expected: entry.expected,
      actual: limitationActual(entry),
      fixtures: [...entry.fixtures].sort(),
      adapters: adaptersCiting(entry.id, adapters, e2eCitations),
    }
    if (entry.kind !== 'silent') published.diagnostics = limitationDiagnostics(entry)
    if (entry.kind === 'by-design') published.reason = entry.reason
    section[entry.id] = published
  }
  return section
}
