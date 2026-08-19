/**
 * bf-p semantic conformance inventory driver (one-shot, not wired into CI).
 *
 * Renders every JSX conformance fixture with the Hono reference AND with
 * ONE adapter under test, decode-and-compares their `bf-p` hydration-props
 * payloads via `hydration-props-conformance.ts`, and writes the full
 * divergence inventory to a JSON file.
 *
 * Dependency direction mirrors `run-adapter-conformance.ts`: this package
 * provides the constraint (the driver, the comparison semantics, the
 * output schema) and knows about no adapter except the Hono reference —
 * each adapter package registers ITSELF by hosting a thin
 * `scripts/hydration-props-inventory.ts` that calls this driver with its
 * own adapter factory / render function / not-available error classes:
 *
 *   bun run packages/adapter-<x>/scripts/hydration-props-inventory.ts [outFile]
 *
 * This is deliberately NOT wired into `run-adapter-conformance.ts` — see
 * that file's docstring policy ("adapter authors do not choose which
 * suites to run") and `hydration-props-conformance.ts`'s module docstring
 * for why: the inventory this driver produces needs to be triaged into
 * `known-limitation` issues + pins first (per CLAUDE.md's "reproducible
 * defect lands as a fixture" rule); wiring an assertion in ahead of that
 * triage would just turn every existing fixture red at once with no pin
 * to point at.
 *
 * Set `BFP_ONLY_IDS` (comma-separated fixture ids) to restrict the run to
 * a subset — useful for a quick smoke run or re-checking one fixture
 * after a fix, without paying for the full ~330-fixture sweep.
 *
 * Adapter availability: Hono always runs (it's the reference). The
 * adapter under test attempts to render every fixture and is skipped
 * per-fixture (not globally) on one of its declared `notAvailableErrors`
 * — so a partially-configured host (e.g. Go present but wrong version)
 * still reports for the fixtures that do work.
 */

import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { jsxFixtures } from '../fixtures'
import type { JSXFixture } from './types'
import {
  compareHydrationProps,
  type BfPDivergenceKind,
  type HydrationPropsComparisonResult,
} from './hydration-props-conformance'

import { HonoAdapter } from '@barefootjs/hono/adapter'
import { renderHonoComponent } from '@barefootjs/hono/test-render'

import type { TemplateAdapter } from '@barefootjs/jsx'

export interface HydrationPropsInventorySpec {
  /** Adapter name as it appears in the inventory output (e.g. 'erb'). */
  name: string
  factory: () => TemplateAdapter
  render: (options: {
    source: string
    adapter: TemplateAdapter
    props?: Record<string, unknown>
    components?: Record<string, string>
    componentModules?: Record<string, string>
    componentName?: string
  }) => Promise<string>
  /** Error classes this adapter's own render function throws when its runtime isn't installed on this host. */
  notAvailableErrors: Array<new (...args: any[]) => Error>
}

type FixtureStatus =
  | 'ok'
  | 'reference-render-error'
  | 'adapter-render-error'
  | 'adapter-not-available'

interface FixtureResult {
  fixtureId: string
  adapter: string
  status: FixtureStatus
  errorMessage?: string
  comparison?: HydrationPropsComparisonResult
}

interface AdapterSummary {
  fixturesAttempted: number
  fixturesNotAvailable: number
  fixturesReferenceError: number
  fixturesAdapterError: number
  fixturesCompared: number
  fixturesWithDivergence: number
  fixturesAdapterEmitsNothing: number
  fixturesFullyMatched: number
  totalReferenceOccurrences: number
  totalAdapterOccurrences: number
  divergenceCountsByKind: Record<BfPDivergenceKind, number>
  everAvailable: boolean
}

function emptyDivergenceCounts(): Record<BfPDivergenceKind, number> {
  return {
    'missing-in-adapter': 0,
    'extra-in-adapter': 0,
    'value-mismatch': 0,
    'parse-error-reference': 0,
    'parse-error-adapter': 0,
  }
}

function renderOptionsFor(fixture: JSXFixture) {
  return {
    source: fixture.source,
    props: fixture.props !== undefined ? structuredClone(fixture.props) : undefined,
    components: fixture.components,
    componentModules: fixture.componentModules,
    componentName: fixture.componentName,
  }
}

/**
 * Run the full fixture sweep for one adapter and write the inventory
 * JSON. Intended to be called from the adapter package's own
 * `scripts/hydration-props-inventory.ts` with `process.argv[2]` as
 * `outFile` (defaults to `hydration-props-inventory.json` in cwd).
 */
export async function runHydrationPropsInventory(
  spec: HydrationPropsInventorySpec,
  outFile?: string,
): Promise<void> {
  const outPath = resolve(process.cwd(), outFile ?? 'hydration-props-inventory.json')

  const results: FixtureResult[] = []
  const summary: AdapterSummary = {
    fixturesAttempted: 0,
    fixturesNotAvailable: 0,
    fixturesReferenceError: 0,
    fixturesAdapterError: 0,
    fixturesCompared: 0,
    fixturesWithDivergence: 0,
    fixturesAdapterEmitsNothing: 0,
    fixturesFullyMatched: 0,
    totalReferenceOccurrences: 0,
    totalAdapterOccurrences: 0,
    divergenceCountsByKind: emptyDivergenceCounts(),
    everAvailable: false,
  }

  const onlyIds = process.env.BFP_ONLY_IDS ? new Set(process.env.BFP_ONLY_IDS.split(',')) : null
  const fixtureList = onlyIds ? jsxFixtures.filter((f) => onlyIds.has(f.id)) : jsxFixtures

  let fixtureIndex = 0
  for (const fixture of fixtureList) {
    fixtureIndex++
    if (fixtureIndex % 25 === 0) {
      process.stderr.write(`… ${fixtureIndex}/${fixtureList.length} fixtures\n`)
    }
    summary.fixturesAttempted++

    let referenceHtml: string | null = null
    try {
      referenceHtml = await renderHonoComponent({ ...renderOptionsFor(fixture), adapter: new HonoAdapter() })
    } catch (err) {
      summary.fixturesReferenceError++
      results.push({
        fixtureId: fixture.id,
        adapter: spec.name,
        status: 'reference-render-error',
        errorMessage: err instanceof Error ? err.message : String(err),
      })
      continue
    }

    let adapterHtml: string
    try {
      adapterHtml = await spec.render({ ...renderOptionsFor(fixture), adapter: spec.factory() })
      summary.everAvailable = true
    } catch (err) {
      const isNotAvailable = spec.notAvailableErrors.some((E) => err instanceof E)
      if (isNotAvailable) {
        summary.fixturesNotAvailable++
        results.push({
          fixtureId: fixture.id,
          adapter: spec.name,
          status: 'adapter-not-available',
          errorMessage: err instanceof Error ? err.message : String(err),
        })
      } else {
        summary.fixturesAdapterError++
        results.push({
          fixtureId: fixture.id,
          adapter: spec.name,
          status: 'adapter-render-error',
          errorMessage: err instanceof Error ? err.message : String(err),
        })
      }
      continue
    }

    const comparison = compareHydrationProps(referenceHtml, adapterHtml)
    summary.fixturesCompared++
    summary.totalReferenceOccurrences += comparison.referenceCount
    summary.totalAdapterOccurrences += comparison.adapterCount
    if (comparison.adapterEmitsNothing) summary.fixturesAdapterEmitsNothing++
    if (comparison.divergences.length === 0) {
      summary.fixturesFullyMatched++
    } else {
      summary.fixturesWithDivergence++
      for (const d of comparison.divergences) {
        summary.divergenceCountsByKind[d.kind]++
      }
    }
    results.push({
      fixtureId: fixture.id,
      adapter: spec.name,
      status: 'ok',
      comparison,
    })
  }

  const output = {
    generatedAt: new Date().toISOString(),
    fixtureCount: fixtureList.length,
    adapters: [spec.name],
    summary: { [spec.name]: summary },
    results,
  }

  writeFileSync(outPath, JSON.stringify(output, null, 2))
  process.stderr.write(`\nWrote inventory to ${outPath}\n`)
  process.stderr.write('\n=== Summary ===\n')
  const s = summary
  process.stderr.write(
    `${spec.name}: available=${s.everAvailable} compared=${s.fixturesCompared} ` +
      `matched=${s.fixturesFullyMatched} diverged=${s.fixturesWithDivergence} ` +
      `emitsNothing=${s.fixturesAdapterEmitsNothing} notAvailable=${s.fixturesNotAvailable} ` +
      `renderError=${s.fixturesAdapterError} refError=${s.fixturesReferenceError} ` +
      `kinds=${JSON.stringify(s.divergenceCountsByKind)}\n`,
  )
}
