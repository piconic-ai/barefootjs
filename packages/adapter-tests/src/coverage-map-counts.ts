/**
 * Read-time aggregates over the committed `coverage-map.json`.
 *
 * The committed ledger holds only per-fixture FACTS (which kinds / axes /
 * contexts each fixture exercises). Every aggregate — the corpus size,
 * the fixture count per kind and per axis — is derived here, at read
 * time, and never committed: an aggregate line is rewritten by every PR
 * that adds a fixture, so two unrelated fixture PRs would always
 * conflict on it, while their per-fixture entries merge cleanly.
 *
 * This is the ONE implementation of those counts. The coverage floor
 * tests, the regen script's summary, `@barefootjs/compat`'s support
 * matrix (construct totals, axis rows) and render-conformance headline
 * (`totalFixtures`), and the docs compatibility-matrix page all call it.
 *
 * Deliberately dependency-free (no `@barefootjs/jsx`, no fixtures): the
 * docs site imports it by relative path, next to the JSON it reads, and
 * takes no package dependency on `@barefootjs/adapter-tests`.
 */

/** The committed shape of `coverage-map.json` that aggregates are computed from. */
export interface CoverageFacts {
  fixtures: Readonly<Record<string, { readonly kinds: readonly string[]; readonly axes: readonly string[] }>>
}

export interface CoverageCounts {
  /** Number of fixtures in the corpus (one `fixtures` entry per fixture). */
  fixtureCount: number
  /** Fixture count per exercised kind, code-unit-sorted keys; uncovered kinds are absent. */
  kindCounts: Record<string, number>
  /** Fixture count per exercised axis, code-unit-sorted keys; uncovered axes are absent. */
  axisCounts: Record<string, number>
}

const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

function sortRecord(rec: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(rec).sort(([a], [b]) => byCodeUnit(a, b)))
}

/** Corpus size and per-kind / per-axis covering-fixture counts. */
export function computeCoverageCounts(map: CoverageFacts): CoverageCounts {
  const kindCounts: Record<string, number> = {}
  const axisCounts: Record<string, number> = {}
  const ids = Object.keys(map.fixtures)
  for (const id of ids) {
    const coverage = map.fixtures[id]
    for (const kind of coverage.kinds) kindCounts[kind] = (kindCounts[kind] ?? 0) + 1
    for (const axis of coverage.axes) axisCounts[axis] = (axisCounts[axis] ?? 0) + 1
  }
  return { fixtureCount: ids.length, kindCounts: sortRecord(kindCounts), axisCounts: sortRecord(axisCounts) }
}
