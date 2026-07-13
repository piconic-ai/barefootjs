/**
 * Oracle conformance over multiplied evaluation points
 * (`spec/subset-conformance.md`, roadmap stage 1).
 *
 * A marked template is a function from data to HTML; the fixture's
 * primary `props`/`expectedHtml` pair observes exactly one point of it.
 * This suite re-renders each fixture that declares `dataPoints` at every
 * additional point, through BOTH the adapter under test and the live JS
 * reference render (the canonical reference implementation — the Hono
 * pipeline), and asserts the normalized HTML is identical. No expected
 * output is stored for data points: the oracle computes it at test time,
 * so it cannot drift.
 *
 * Gate ordering: data points prove nothing when the basic shape is
 * already broken, so each fixture's points run only after its primary
 * render matches `expectedHtml` (the hand-written smoke point, which
 * doubles as the human pin against oracle-and-adapter agreeing on the
 * same bug). A failed gate is reported by the JSX conformance suite —
 * the point tests then no-op instead of duplicating the failure.
 *
 * Skips follow the established discipline: a typed
 * `${fixtureId}:${pointName}` set, each entry commented with the
 * follow-up `known-limitation` issue.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, test, expect } from 'bun:test'
import { HonoAdapter } from '@barefootjs/hono/adapter'
import { renderHonoComponent } from '@barefootjs/hono/test-render'
import type { TemplateAdapter } from '../../jsx/src/types'
import { jsxFixtures } from '../fixtures'
import type { JSXFixture, JSXDataPoint } from './types'
import {
  normalizeHTML,
  stripConditionalMarkersForCrossAdapter,
  type RenderOptions,
} from './jsx-runner'

/**
 * Type-derived points (roadmap 3) come from the committed artifact, not
 * a per-registration computation — see `adversarial-catalog.ts` for why
 * (cost, reviewable diffs, stable names). Its freshness is held by
 * `__tests__/generated-data-points.test.ts`.
 */
const generatedPoints: Record<string, JSXDataPoint[]> = JSON.parse(
  readFileSync(resolve(import.meta.dir, '../generated-data-points.json'), 'utf8'),
)

function pointsForFixture(fixture: JSXFixture): JSXDataPoint[] {
  return [...(fixture.dataPoints ?? []), ...(generatedPoints[fixture.id] ?? [])]
}

export interface RunDataPointConformanceOptions {
  /** Short lowercase label used in `describe` headings. */
  name: string
  /** Fresh-instance factory, one adapter per render. */
  factory: () => TemplateAdapter
  /** The adapter's real render pipeline (same as the JSX suite). */
  render: (opts: RenderOptions) => Promise<string>
  /** Same renderer-unavailable escape hatch as the JSX suite. */
  onRenderError?: (err: Error, fixtureId: string) => boolean
  /**
   * Fixture ids excluded wholesale — fixtures this adapter already
   * skips in the JSX suite or refuses via `expectedDiagnostics`
   * (their primary point cannot gate anything).
   */
  skipFixtures: ReadonlySet<string>
  /**
   * Per-point opt-outs, keyed `${fixtureId}:${pointName}`. Each entry
   * must carry a comment naming the divergence and its follow-up
   * `known-limitation` issue.
   */
  skipDataPoints?: ReadonlySet<string>
}

type GateResult = 'pass' | 'fail' | 'unavailable'

function canonical(html: string): string {
  return stripConditionalMarkersForCrossAdapter(normalizeHTML(html))
}

function renderOptions(fixture: JSXFixture, adapter: TemplateAdapter, props: Record<string, unknown> | undefined): RenderOptions {
  return {
    source: fixture.source,
    adapter,
    // Same prop-mutation isolation as the JSX suite: a fixture source
    // that mutates its props (`.sort()`, `.reverse()`) must not poison
    // the shared fixture object across renders.
    props: props !== undefined ? structuredClone(props) : undefined,
    components: fixture.components,
    componentModules: fixture.componentModules,
    componentName: fixture.componentName,
  }
}

export function runDataPointConformance(opts: RunDataPointConformanceOptions): void {
  // Skip-ledger rot protection: every skip entry must name a point that
  // actually exists (declared or generated). Without this, a catalogue
  // or fixture change silently orphans the entry and the divergence it
  // documents stops being pinned anywhere.
  if (opts.skipDataPoints) {
    const validKeys = new Set(
      jsxFixtures.flatMap(f => pointsForFixture(f).map(p => `${f.id}:${p.name}`)),
    )
    const orphans = [...opts.skipDataPoints].filter(k => !validKeys.has(k))
    if (orphans.length > 0) {
      throw new Error(
        `[${opts.name}] skipDataPoints entries match no existing data point ` +
          `(fixture or catalogue changed?): ${orphans.join(', ')}`,
      )
    }
  }

  const fixtures = jsxFixtures.filter(
    f => pointsForFixture(f).length > 0 && !opts.skipFixtures.has(f.id),
  )
  if (fixtures.length === 0) return

  describe('data-point conformance (oracle)', () => {
    for (const fixture of fixtures) {
      describe(`[${fixture.id}]`, () => {
        // One gate render per fixture, shared by its point tests. The
        // promise is created lazily so a fully-skipped fixture never
        // renders.
        let gate: Promise<GateResult> | undefined
        const runGate = (): Promise<GateResult> => {
          gate ??= (async () => {
            let html: string
            try {
              html = await opts.render(renderOptions(fixture, opts.factory(), fixture.props))
            } catch (err) {
              if (opts.onRenderError?.(err as Error, fixture.id)) return 'unavailable'
              throw err
            }
            // `expectedHtml` presence is enforced by `createFixture` for
            // fixtures declaring dataPoints.
            return canonical(html) === canonical(fixture.expectedHtml as string) ? 'pass' : 'fail'
          })()
          return gate
        }

        for (const point of pointsForFixture(fixture)) {
          if (opts.skipDataPoints?.has(`${fixture.id}:${point.name}`)) continue

          test(
            `point '${point.name}' matches the JS reference render`,
            async () => {
              const gateResult = await runGate()
              if (gateResult === 'unavailable') return
              if (gateResult === 'fail') {
                // The primary smoke point failed — reported loudly by
                // the JSX conformance suite for this fixture; adversarial
                // points prove nothing on a broken base shape.
                console.warn(
                  `[${opts.name}] ${fixture.id}: primary expectedHtml mismatch — ` +
                    `data point '${point.name}' gated (see JSX conformance failure)`,
                )
                return
              }

              let adapterHtml: string
              try {
                adapterHtml = await opts.render(renderOptions(fixture, opts.factory(), point.props))
              } catch (err) {
                if (opts.onRenderError?.(err as Error, fixture.id)) return
                throw err
              }
              const oracleHtml = await renderHonoComponent(
                renderOptions(fixture, new HonoAdapter(), point.props),
              )

              expect(canonical(adapterHtml)).toBe(canonical(oracleHtml))
            },
            30_000,
          )
        }
      })
    }
  })
}
