// @barefootjs/compat — the known-limitations section of `ui/compat.lock.json`.
//
// The registry (`packages/adapter-tests/limitations/`) declares WHAT each
// limitation is; the adapters' `conformancePins` / `renderDivergences`
// declare WHERE it bites. This module joins the two into the deterministic
// shape the docs compatibility-matrix page renders as its "Known
// limitations" section and anchors every diagnostic link on: one entry per
// registry id, with the affected adapters DERIVED from the pins that cite
// it — never declared on the entry (an entry names no adapter, by rule).

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
  /** Adapter ids whose pins or render divergences cite this limitation (`hono` first, then alphabetical). */
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

/** Adapter ids citing `limitationId` through any pin or render divergence. */
export function adaptersCiting(limitationId: string, adapters: ReadonlyArray<LimitationsAdapterInput>): string[] {
  const ids = new Set<string>()
  for (const adapter of adapters) {
    const pinned = Object.values(adapter.pins).some(pins => pins.some(p => p.limitation === limitationId))
    const divergent = Object.values(adapter.renderDivergences).some(d => d.limitation === limitationId)
    if (pinned || divergent) ids.add(adapter.id)
  }
  return [...ids].sort(compareAdapterIds)
}

export function buildLimitationsSection(
  registry: readonly Limitation[],
  adapters: ReadonlyArray<LimitationsAdapterInput>,
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
      adapters: adaptersCiting(entry.id, adapters),
    }
    if (entry.kind !== 'silent') published.diagnostics = limitationDiagnostics(entry)
    if (entry.kind === 'by-design') published.reason = entry.reason
    section[entry.id] = published
  }
  return section
}
