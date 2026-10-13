/**
 * PebbleAdapter — Conformance Tests
 *
 * Runs the shared adapter conformance corpus (JSX fixtures, template
 * primitives, marker conformance) against the Pebble adapter, rendering
 * each fixture end-to-end through real Java + the bundled Pebble Java
 * runtime (`packages/adapter-pebble/java/`) via `renderPebbleComponent`.
 *
 * Started from `packages/adapter-jinja/src/__tests__/jinja-adapter.test.ts`'s
 * skip/pin sets per the `add-adapter` Phase 4 task (Pebble is a Twig-family
 * DSL adapter, same as Jinja/Twig structurally) — divergences from that
 * starting point are called out inline in `../conformance-pins.ts` /
 * `../render-divergences.ts`, not here.
 */

import { describe, test, expect } from 'bun:test'
import { runAdapterConformanceTests, findLimitation } from '@barefootjs/adapter-tests'
import { PebbleAdapter } from '../adapter/index.ts'
import { renderPebbleComponent, JavaNotAvailableError } from '../test-render.ts'
import { conformancePins } from '../conformance-pins.ts'
import { renderDivergences, dataPointDivergences } from '../render-divergences.ts'

runAdapterConformanceTests({
  name: 'pebble',
  factory: () => new PebbleAdapter(),
  render: renderPebbleComponent,
  skipJsx: Object.keys(renderDivergences),
  expectedDiagnostics: conformancePins,
  skipMarkerConformance: new Set([
    // Same `/* @client */` keyed-`.map` marker-elision reason as every
    // other DSL adapter (Jinja/Twig/Rust) — see hono-adapter.test for the
    // contract.
    'todo-app',
    'data-table',
  ]),
  skipDataPoints: new Set(Object.keys(dataPointDivergences)),
  onRenderError: (err, id) => {
    if (err instanceof JavaNotAvailableError) {
      console.log(`Skipping [${id}]: ${err.message}`)
      return true
    }
    return false
  },
})

describe('dataPointDivergences', () => {
  for (const [point, { limitation }] of Object.entries(dataPointDivergences)) {
    test(`[${point}] cites an existing limitation`, () => {
      expect(
        findLimitation(limitation),
        `'${point}' cites limitation '${limitation}', which is not in the registry: ` +
          'if it graduated, the data point renders like Hono now, so delete this skip too',
      ).toBeDefined()
    })
  }
})
