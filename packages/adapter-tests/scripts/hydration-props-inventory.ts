#!/usr/bin/env bun
/**
 * bf-p semantic conformance inventory (one-shot, not wired into CI).
 *
 * Renders every JSX conformance fixture with the Hono reference AND
 * with each locally runnable adapter, decode-and-compares their
 * `bf-p` hydration-props payloads via `hydration-props-conformance.ts`,
 * and writes the full divergence inventory to a JSON file.
 *
 * This is deliberately NOT wired into `run-adapter-conformance.ts` —
 * see that file's docstring policy ("adapter authors do not choose
 * which suites to run") and `hydration-props-conformance.ts`'s
 * module docstring for why: the inventory this script produces needs
 * to be triaged into `known-limitation` issues + pins first (per
 * CLAUDE.md's "reproducible defect lands as a fixture" rule); wiring
 * an assertion in ahead of that triage would just turn every existing
 * fixture red at once with no pin to point at.
 *
 * Usage:
 *   bun run packages/adapter-tests/scripts/hydration-props-inventory.ts [outFile]
 *
 * Set `BFP_ONLY_IDS` (comma-separated fixture ids) to restrict the run
 * to a subset — useful for a quick smoke run or re-checking one
 * fixture after a fix, without paying for the full ~330-fixture ×
 * 8-adapter sweep.
 *
 * Adapter availability: Hono always runs (it's the reference). Every
 * other adapter attempts to render every fixture and is skipped
 * per-fixture (not globally) on a `*NotAvailableError` from that
 * adapter's own `test-render.ts` — so a partially-configured host
 * (e.g. Go present but wrong version) still reports for adapters that
 * do work.
 */

import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { jsxFixtures } from '../fixtures'
import type { JSXFixture } from '../src/types'
import {
  compareHydrationProps,
  type BfPDivergenceKind,
  type HydrationPropsComparisonResult,
} from '../src/hydration-props-conformance'

import { HonoAdapter } from '@barefootjs/hono/adapter'
import { renderHonoComponent } from '@barefootjs/hono/test-render'

import { GoTemplateAdapter } from '@barefootjs/go-template/adapter'
import { renderGoTemplateComponent, GoNotAvailableError } from '@barefootjs/go-template/test-render'

import { ErbAdapter } from '@barefootjs/erb/adapter'
import { renderErbComponent, ErbNotAvailableError } from '@barefootjs/erb/test-render'

import { JinjaAdapter } from '@barefootjs/jinja/adapter'
import { renderJinjaComponent, PythonNotAvailableError } from '@barefootjs/jinja/test-render'

import { MojoAdapter } from '@barefootjs/mojolicious/adapter'
import { renderMojoComponent, PerlNotAvailableError } from '@barefootjs/mojolicious/test-render'

import { XslateAdapter } from '@barefootjs/xslate/adapter'
import { renderXslateComponent, XslateNotAvailableError } from '@barefootjs/xslate/test-render'

import { TwigAdapter } from '@barefootjs/twig/adapter'
import { renderTwigComponent, TwigNotAvailableError } from '@barefootjs/twig/test-render'

import { BladeAdapter } from '@barefootjs/blade/adapter'
import { renderBladeComponent, BladeNotAvailableError } from '@barefootjs/blade/test-render'

import { MinijinjaAdapter } from '@barefootjs/rust/adapter'
import { renderMinijinjaComponent, RustNotAvailableError } from '@barefootjs/rust/test-render'

import type { TemplateAdapter } from '@barefootjs/jsx'

interface AdapterUnderTest {
  name: string
  makeAdapter: () => TemplateAdapter
  render: (options: {
    source: string
    adapter: TemplateAdapter
    props?: Record<string, unknown>
    components?: Record<string, string>
    componentModules?: Record<string, string>
    componentName?: string
  }) => Promise<string>
  /** Error classes this adapter's own render function throws when its runtime isn't installed on this host. */
  notAvailableErrors: Array<new (...args: never[]) => Error>
}

const ADAPTERS: AdapterUnderTest[] = [
  {
    name: 'go-template',
    makeAdapter: () => new GoTemplateAdapter(),
    render: renderGoTemplateComponent,
    notAvailableErrors: [GoNotAvailableError],
  },
  {
    name: 'erb',
    makeAdapter: () => new ErbAdapter(),
    render: renderErbComponent,
    notAvailableErrors: [ErbNotAvailableError],
  },
  {
    name: 'jinja',
    makeAdapter: () => new JinjaAdapter(),
    render: renderJinjaComponent,
    notAvailableErrors: [PythonNotAvailableError],
  },
  {
    name: 'mojolicious',
    makeAdapter: () => new MojoAdapter(),
    render: renderMojoComponent,
    notAvailableErrors: [PerlNotAvailableError],
  },
  {
    name: 'xslate',
    makeAdapter: () => new XslateAdapter(),
    render: renderXslateComponent,
    notAvailableErrors: [XslateNotAvailableError],
  },
  {
    name: 'twig',
    makeAdapter: () => new TwigAdapter(),
    render: renderTwigComponent,
    notAvailableErrors: [TwigNotAvailableError],
  },
  {
    name: 'blade',
    makeAdapter: () => new BladeAdapter(),
    render: renderBladeComponent,
    notAvailableErrors: [BladeNotAvailableError],
  },
  {
    name: 'rust',
    makeAdapter: () => new MinijinjaAdapter(),
    render: renderMinijinjaComponent,
    notAvailableErrors: [RustNotAvailableError],
  },
]

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

async function main() {
  const outPath = resolve(process.cwd(), process.argv[2] ?? 'hydration-props-inventory.json')

  const results: FixtureResult[] = []

  // Restrict which adapters actually render, e.g. `BFP_ONLY_ADAPTERS=go-template`
  // for a single-adapter re-run (full fixture sweep, ~1/8th the cost) after a
  // harness fix that only applies to one adapter. Summaries/results for
  // filtered-out adapters are simply absent from the output, not zeroed —
  // don't merge this file's summary in place of a full multi-adapter run.
  const onlyAdapterNames = process.env.BFP_ONLY_ADAPTERS
    ? new Set(process.env.BFP_ONLY_ADAPTERS.split(','))
    : null
  const activeAdapters = onlyAdapterNames ? ADAPTERS.filter((a) => onlyAdapterNames.has(a.name)) : ADAPTERS

  const summaries = new Map<string, AdapterSummary>()
  for (const a of activeAdapters) {
    summaries.set(a.name, {
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
    })
  }

  const onlyIds = process.env.BFP_ONLY_IDS ? new Set(process.env.BFP_ONLY_IDS.split(',')) : null
  const fixtureList = onlyIds ? jsxFixtures.filter((f) => onlyIds.has(f.id)) : jsxFixtures

  let fixtureIndex = 0
  for (const fixture of fixtureList) {
    fixtureIndex++
    if (fixtureIndex % 25 === 0) {
      process.stderr.write(`… ${fixtureIndex}/${fixtureList.length} fixtures\n`)
    }

    // Render the reference ONCE per fixture (shared across every
    // adapter comparison this fixture participates in).
    let referenceHtml: string | null = null
    let referenceError: string | null = null
    try {
      referenceHtml = await renderHonoComponent({ ...renderOptionsFor(fixture), adapter: new HonoAdapter() })
    } catch (err) {
      referenceError = err instanceof Error ? err.message : String(err)
    }

    for (const a of activeAdapters) {
      const summary = summaries.get(a.name)!
      summary.fixturesAttempted++

      if (referenceError !== null) {
        summary.fixturesReferenceError++
        results.push({
          fixtureId: fixture.id,
          adapter: a.name,
          status: 'reference-render-error',
          errorMessage: referenceError,
        })
        continue
      }

      let adapterHtml: string
      try {
        adapterHtml = await a.render({ ...renderOptionsFor(fixture), adapter: a.makeAdapter() })
        summary.everAvailable = true
      } catch (err) {
        const isNotAvailable = a.notAvailableErrors.some((E) => err instanceof E)
        if (isNotAvailable) {
          summary.fixturesNotAvailable++
          results.push({
            fixtureId: fixture.id,
            adapter: a.name,
            status: 'adapter-not-available',
            errorMessage: err instanceof Error ? err.message : String(err),
          })
        } else {
          summary.fixturesAdapterError++
          results.push({
            fixtureId: fixture.id,
            adapter: a.name,
            status: 'adapter-render-error',
            errorMessage: err instanceof Error ? err.message : String(err),
          })
        }
        continue
      }

      const comparison = compareHydrationProps(referenceHtml!, adapterHtml)
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
        adapter: a.name,
        status: 'ok',
        comparison,
      })
    }
  }

  const output = {
    generatedAt: new Date().toISOString(),
    fixtureCount: fixtureList.length,
    adapters: activeAdapters.map((a) => a.name),
    summary: Object.fromEntries(summaries),
    results,
  }

  writeFileSync(outPath, JSON.stringify(output, null, 2))
  process.stderr.write(`\nWrote inventory to ${outPath}\n`)
  process.stderr.write('\n=== Summary ===\n')
  for (const [name, s] of summaries) {
    process.stderr.write(
      `${name}: available=${s.everAvailable} compared=${s.fixturesCompared} ` +
        `matched=${s.fixturesFullyMatched} diverged=${s.fixturesWithDivergence} ` +
        `emitsNothing=${s.fixturesAdapterEmitsNothing} notAvailable=${s.fixturesNotAvailable} ` +
        `renderError=${s.fixturesAdapterError} refError=${s.fixturesReferenceError} ` +
        `kinds=${JSON.stringify(s.divergenceCountsByKind)}\n`,
    )
  }
}

main()
