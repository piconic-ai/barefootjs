/**
 * Single mandatory entry point for per-adapter conformance.
 *
 * Each adapter package's test file calls this exactly once. The
 * function bundles every conformance suite the adapter contract
 * defines today, plus future ones added here. Adapter authors do not
 * choose which suites to run — they only declare what to skip.
 *
 * Why this shape:
 *
 * - Adding a new suite is a single-place edit (this file). Every
 *   adapter automatically picks it up on the next test run, with the
 *   suite's case set fully exercised unless the adapter explicitly
 *   opts out.
 * - The "I forgot to wire up the new conformance suite" failure mode
 *   becomes impossible: there's nothing to wire up in the adapter's
 *   own test file.
 * - Skip sets are typed per-suite, so a typo in an opt-out is a TS
 *   error rather than a silent miss.
 *
 * Adapter authors graduate a case by removing it from the matching
 * skip set; the next test run picks it up.
 */

import { describe, test, expect } from 'bun:test'
import type { TemplateAdapter } from '../../jsx/src/types'
import { runJSXConformanceTests, type RenderOptions } from './jsx-runner'
import { runConformanceSuite } from './conformance'
import { runDataPointConformance } from './data-point-conformance'
import { runMarkerConformance } from './marker-conformance'
import type { ExpectedDiagnostic } from './types'
import {
  templatePrimitiveCases,
  runTemplatePrimitiveCase,
  type TemplatePrimitiveCaseId,
  type TemplatePrimitiveInput,
} from './cases/template-primitives'
import { assertRenderContract } from './render.contract'
import { fixture as counterButtonsFixture } from '../fixtures/counter-buttons'

export interface RunAdapterConformanceOptions {
  /** Short lowercase label used in `describe` headings. */
  name: string
  /**
   * Fresh-instance factory called per test. Each test gets its own
   * adapter so per-instance state doesn't bleed across cases.
   */
  factory: () => TemplateAdapter
  /** Renderer for JSX-fixture-based conformance. */
  render: (opts: RenderOptions) => Promise<string>
  /** Reference adapter for HTML-diff conformance (optional). */
  referenceAdapter?: () => TemplateAdapter
  referenceRender?: (opts: RenderOptions) => Promise<string>
  /**
   * Optional escape hatch for renderer-level errors (e.g. Go runtime
   * not installed in CI). Return true to skip the failing fixture.
   */
  onRenderError?: (err: Error, fixtureId: string) => boolean

  /**
   * Per-suite opt-outs. Each new conformance suite added to this
   * function adds a new typed skip field. Adapters declare only the
   * skip sets they need; missing fields default to "skip nothing".
   */
  skipJsx?: ReadonlyArray<string>
  skipTemplatePrimitives?: ReadonlySet<TemplatePrimitiveCaseId>
  /**
   * Fixture ids whose marker shape is consciously drifting on this
   * adapter (e.g. a marker the adapter does not yet emit). Each entry
   * should be paired with a comment naming the missing marker and the
   * follow-up issue; missing entries default to "skip nothing".
   *
   * Marker conformance asserts that for each fixture, the IR layer's
   * slot / conditional / loop ids appear in the adapter's emitted
   * template — different syntactic shapes (attribute vs comment) are
   * allowed, missing ids are not. See `marker-conformance.ts`.
   */
  skipMarkerConformance?: ReadonlySet<string>
  /**
   * Skip the render-stage contract suite (#2158) for this adapter.
   * Each skip must carry a comment naming the follow-up issue that will
   * bring the adapter's render pipeline up to the contract. Default:
   * run the suite.
   */
  skipRenderContract?: boolean
  /**
   * Per-fixture diagnostic contracts owned by this adapter. Keyed by
   * `JSXFixture.id`; the runner compiles the fixture and asserts each
   * `{ code, severity }` appears in `ir.errors`, then skips HTML
   * comparison. Lives on the adapter side (not on the shared fixture)
   * so adding a new adapter doesn't touch any fixture file.
   */
  expectedDiagnostics?: Record<string, ReadonlyArray<ExpectedDiagnostic>>
  /**
   * Data points (`spec/subset-conformance.md`) whose oracle comparison
   * is consciously diverging on this adapter, keyed
   * `${fixtureId}:${pointName}`. Each entry should be paired with a
   * comment naming the divergence and the follow-up `known-limitation`
   * issue; missing entries default to "skip nothing". Fixtures already
   * in `skipJsx` / `expectedDiagnostics` are excluded wholesale — their
   * primary point cannot gate anything.
   */
  skipDataPoints?: ReadonlySet<string>
}

export function runAdapterConformanceTests(
  opts: RunAdapterConformanceOptions,
): void {
  runJSXConformanceTests({
    createAdapter: opts.factory,
    render: opts.render,
    referenceAdapter: opts.referenceAdapter,
    referenceRender: opts.referenceRender,
    onRenderError: opts.onRenderError,
    skip: opts.skipJsx ? [...opts.skipJsx] : undefined,
    expectedDiagnostics: opts.expectedDiagnostics,
  })

  runConformanceSuite<TemplatePrimitiveCaseId, TemplatePrimitiveInput, string>({
    name: 'template primitives conformance',
    issue: '#1187 phase 3',
    adapter: {
      name: opts.name,
      factory: opts.factory,
      skip: new Set(opts.skipTemplatePrimitives ?? []),
    },
    cases: templatePrimitiveCases,
    run: runTemplatePrimitiveCase,
  })

  runMarkerConformance({
    name: opts.name,
    factory: opts.factory,
    skipFixtures: opts.skipMarkerConformance,
  })

  runDataPointConformance({
    name: opts.name,
    factory: opts.factory,
    render: opts.render,
    onRenderError: opts.onRenderError,
    skipFixtures: new Set([
      ...(opts.skipJsx ?? []),
      ...Object.keys(opts.expectedDiagnostics ?? {}),
    ]),
    skipDataPoints: opts.skipDataPoints,
  })

  if (opts.skipRenderContract) return

  // Render-stage conformance contract (#2158): renders the
  // `counter-buttons` corpus fixture through this adapter's OWN real
  // render pipeline (fresh adapter instance, no special props) and
  // asserts the five `assertRenderContract` checks. Reuses the same
  // `onRenderError` escape hatch as the JSX suite above — a
  // `*NotAvailableError` (runtime not installed) skips rather than
  // fails, matching `runJSXConformanceTests`'s render-error handling.
  describe('render contract (#2158)', () => {
    test(
      'Counter+Button satisfies the render contract',
      async () => {
        const adapter = opts.factory()
        let html: string
        try {
          html = await opts.render({
            source: counterButtonsFixture.source,
            adapter,
            components: counterButtonsFixture.components,
            componentName: counterButtonsFixture.componentName,
          })
        } catch (err) {
          if (opts.onRenderError?.(err as Error, counterButtonsFixture.id)) return
          throw err
        }
        expect(html).toBeTruthy()
        assertRenderContract(html)
      },
      30_000,
    )
  })
}
