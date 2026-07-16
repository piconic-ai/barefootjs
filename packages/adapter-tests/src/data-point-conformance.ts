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

/**
 * PR-vs-nightly cost tiering (#2278). The generated adversarial points grow
 * with every catalogue extension (#2274 Date rows, #2277 union/object) and
 * each is a real-backend process spawn on the native adapters. `pr` runs a
 * bounded, deterministic sample of generated points (declared points always
 * run); `full` runs everything. Default is `full` — only CI's per-adapter
 * PR/push jobs opt into `pr` (the nightly `schedule` run stays `full`), so a
 * local `bun test` always exercises the whole matrix.
 */
const DATA_POINT_TIER: 'pr' | 'full' = process.env.BF_DATA_POINT_TIER === 'pr' ? 'pr' : 'full'

/** PR-tier cap on GENERATED points per fixture; declared points are never capped. */
const PR_TIER_GENERATED_CAP = 3

/**
 * Deterministic even-spread sample of at most `PR_TIER_GENERATED_CAP`
 * generated points. Stride sampling across the declared order keeps both
 * ends plus the middle, so the PR tier probes a spread of a fixture's
 * generated axes rather than only the first few. Index-based (no RNG) so a
 * PR-tier failure reproduces exactly.
 */
export function sampleGeneratedPoints(
  points: readonly JSXDataPoint[],
  cap = PR_TIER_GENERATED_CAP,
): JSXDataPoint[] {
  if (points.length <= cap) return [...points]
  const out: JSXDataPoint[] = []
  for (let i = 0; i < cap; i++) out.push(points[Math.floor((i * points.length) / cap)])
  return out
}

/**
 * Every point a fixture defines — declared plus every generated one. The
 * skip-ledger's universe: a `skipDataPoints` entry for a point the PR tier
 * happens to sample out must still count as valid (not an orphan).
 */
function allPointsForFixture(fixture: JSXFixture): JSXDataPoint[] {
  return [...(fixture.dataPoints ?? []), ...(generatedPoints[fixture.id] ?? [])]
}

/**
 * The points to actually RUN under the current tier: declared points always,
 * generated points fully on `full` or a deterministic sample on `pr`.
 */
function runPointsForFixture(fixture: JSXFixture): JSXDataPoint[] {
  const generated = generatedPoints[fixture.id] ?? []
  const gen = DATA_POINT_TIER === 'pr' ? sampleGeneratedPoints(generated) : generated
  return [...(fixture.dataPoints ?? []), ...gen]
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

/**
 * Revive `{ $date: ISO }` envelopes into real `Date` instances, recursing
 * through arrays and plain objects. The catalogued `Date` data type (#2274)
 * cannot survive the committed `generated-data-points.json` artifact as a
 * `Date`, so the generated catalogue and any hand-declared point may carry
 * the same `{ $date: ISO }` envelope the vector harnesses use (#2288); this
 * normalizes both that envelope and an already-real `Date` to a `Date`
 * before either render leg. The JS oracle then answers `.getUTCFullYear()`
 * on a genuine `Date`, and each adapter's prop-baker sees an `instanceof
 * Date` value to transport as its ISO string. Runs after `structuredClone`,
 * which preserves both a `Date` and a plain-object envelope.
 */
function materializeDates(value: unknown): unknown {
  if (value instanceof Date || value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(materializeDates)
  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length === 1 && entries[0][0] === '$date' && typeof entries[0][1] === 'string') {
    return new Date(entries[0][1])
  }
  return Object.fromEntries(entries.map(([k, v]) => [k, materializeDates(v)]))
}

function canonical(html: string): string {
  return stripConditionalMarkersForCrossAdapter(normalizeHTML(html))
}

function renderOptions(fixture: JSXFixture, adapter: TemplateAdapter, props: Record<string, unknown> | undefined): RenderOptions {
  return {
    source: fixture.source,
    adapter,
    // Same prop-mutation isolation as the JSX suite: a fixture source
    // that mutates its props (`.sort()`, `.reverse()`) must not poison
    // the shared fixture object across renders. `materializeDates` then
    // turns any `{ $date: ISO }` envelope into a real `Date` (#2274) so
    // both the oracle and the adapter under test see the same instant.
    props: props !== undefined ? (materializeDates(structuredClone(props)) as Record<string, unknown>) : undefined,
    components: fixture.components,
    componentModules: fixture.componentModules,
    componentName: fixture.componentName,
  }
}

export function runDataPointConformance(opts: RunDataPointConformanceOptions): void {
  // No silent cap (#2278): when the PR tier defers generated points, say so
  // loudly — how many ran vs. how many the nightly full-matrix run covers.
  if (DATA_POINT_TIER === 'pr') {
    let total = 0
    let kept = 0
    for (const f of jsxFixtures) {
      const g = generatedPoints[f.id] ?? []
      total += g.length
      kept += sampleGeneratedPoints(g).length
    }
    if (total - kept > 0) {
      console.warn(
        `[${opts.name}] data-point tier=pr: all declared + ${kept}/${total} generated points; ` +
          `${total - kept} deferred to the nightly full-matrix run (BF_DATA_POINT_TIER=full runs all).`,
      )
    }
  }

  // Skip-ledger rot protection: every skip entry must name a point that
  // actually exists (declared or generated). Validated against the FULL
  // universe (`allPointsForFixture`), not the tier-sampled run set, so a
  // skip for a point the PR tier defers isn't mistaken for an orphan.
  if (opts.skipDataPoints) {
    const validKeys = new Set(
      jsxFixtures.flatMap(f => allPointsForFixture(f).map(p => `${f.id}:${p.name}`)),
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
    f => allPointsForFixture(f).length > 0 && !opts.skipFixtures.has(f.id),
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

        for (const point of runPointsForFixture(fixture)) {
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
