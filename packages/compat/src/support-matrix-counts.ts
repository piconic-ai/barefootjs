// @barefootjs/compat — read-time `pass` / `total` for `ui/support-matrix.lock.json`.
//
// The committed lock holds only facts: per construct, per adapter, the
// gapped covering fixtures (`gaps`). The counts a reader shows — a
// construct's covering-fixture `total` and each cell's `pass` — are NOT
// committed: nearly every fixture PR moves them for every adapter, so two
// unrelated fixture PRs would always conflict on those lines. They are
// derived here instead, at read time, from the lock's gaps joined with
// the committed `coverage-map.json` facts (via `computeCoverageCounts`,
// the one implementation of the per-construct fixture count).
//
// This is the ONE implementation of those counts: the support-matrix
// tests and the docs compatibility-matrix page both call it. Kept free of
// runtime dependencies beyond the (equally dependency-free) coverage-count
// helper, because the docs site imports it by relative path, the same way
// it imports the lock JSON itself, without a package dependency on
// `@barefootjs/compat`.

import { computeCoverageCounts, type CoverageFacts } from '../../adapter-tests/src/coverage-map-counts'

/** The part of a committed support-matrix construct the counts read: each adapter cell's gaps. */
export interface SupportMatrixConstructFacts {
  cells: Readonly<Record<string, { readonly gaps?: readonly unknown[] }>>
}

/** The part of the committed `ui/support-matrix.lock.json` the counts read. */
export interface SupportMatrixFacts {
  kinds: Readonly<Record<string, SupportMatrixConstructFacts>>
  axes: Readonly<Record<string, SupportMatrixConstructFacts>>
}

/** Covering fixtures clean on this adapter (`pass`) out of all covering fixtures (`total`). */
export interface SupportMatrixCellCounts {
  pass: number
  total: number
}

/** A construct's covering-fixture `total` and each present adapter cell's counts. */
export interface SupportMatrixConstructCounts {
  total: number
  cells: Record<string, SupportMatrixCellCounts>
}

export interface SupportMatrixCounts {
  kinds: Record<string, SupportMatrixConstructCounts>
  axes: Record<string, SupportMatrixConstructCounts>
}

function countSection(
  records: Readonly<Record<string, SupportMatrixConstructFacts>>,
  coveringCounts: Readonly<Record<string, number>>,
): Record<string, SupportMatrixConstructCounts> {
  const out: Record<string, SupportMatrixConstructCounts> = {}
  for (const [name, construct] of Object.entries(records)) {
    // A construct no fixture exercises (e.g. `regex`) is absent from the
    // coverage counts: total 0.
    const total = coveringCounts[name] ?? 0
    const cells: Record<string, SupportMatrixCellCounts> = {}
    for (const [adapterId, cell] of Object.entries(construct.cells)) {
      cells[adapterId] = { pass: total - (cell.gaps?.length ?? 0), total }
    }
    out[name] = { total, cells }
  }
  return out
}

/**
 * `pass` / `total` for every construct and cell of a support-matrix lock.
 * `total` = fixtures whose coverage-map entry lists the construct;
 * `pass` = `total` minus the cell's gapped fixtures (each gap is one of
 * those covering fixtures, by construction in `buildSupportMatrix`).
 */
export function computeSupportMatrixCounts(lock: SupportMatrixFacts, coverage: CoverageFacts): SupportMatrixCounts {
  const { kindCounts, axisCounts } = computeCoverageCounts(coverage)
  return {
    kinds: countSection(lock.kinds, kindCounts),
    axes: countSection(lock.axes, axisCounts),
  }
}
