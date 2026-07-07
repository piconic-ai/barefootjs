// The consistency gate for `renderDivergences` — the render-level sibling
// of compat-pins.test.ts. Every entry an adapter package declares must:
//
//  (a) point at a real fixture in the shared corpus (catches stale
//      entries left behind after a fixture is renamed/removed),
//  (b) NOT overlap that adapter's `conformancePins` — a fixture is either
//      refused at build time (pin) or renders divergently (this list),
//      never both on one adapter (the render skip would be unreachable
//      in its conformance suite), and
//  (c) actually COMPILE clean on that adapter (no error-severity
//      diagnostics) when compiled the way the conformance suite compiles
//      it — a render-divergence entry whose fixture stops compiling
//      belongs in `conformancePins` instead, and this test forces that
//      migration rather than letting the docs page mislabel the gap.
//
// Same relative `jsxFixtures` import precedent as compat-pins.test.ts.

import { describe, test, expect } from 'bun:test'
import { jsxFixtures } from '../../../adapter-tests/fixtures'
import { loadCompatAdapters } from '../adapter-registry'
import { compileForCompat } from '../engine'

const { loaded } = await loadCompatAdapters()

describe('renderDivergences consistency', () => {
  for (const adapter of loaded) {
    describe(adapter.id, () => {
      const fixtureIds = Object.keys(adapter.renderDivergences)

      if (fixtureIds.length === 0) {
        test('declares no render divergences', () => {
          expect(fixtureIds).toEqual([])
        })
        return
      }

      test('no fixture is both pinned and render-divergent', () => {
        const overlap = fixtureIds.filter(id => id in adapter.pins)
        expect(overlap).toEqual([])
      })

      for (const fixtureId of fixtureIds) {
        test(`[${fixtureId}] exists in the corpus and compiles clean`, () => {
          const fixture = jsxFixtures.find(f => f.id === fixtureId)
          if (!fixture) {
            throw new Error(
              `stale render-divergence: adapter '${adapter.id}' declares fixture '${fixtureId}', which does not exist in jsxFixtures`,
            )
          }

          const reason = adapter.renderDivergences[fixtureId]
          expect(typeof reason).toBe('string')
          expect(reason.length).toBeGreaterThan(0)

          const instance = adapter.factory()
          const errors = compileForCompat(
            fixture.source,
            'component.tsx',
            instance,
            'conformance',
            fixture.components,
          )
          const errorSeverity = errors.filter(e => e.severity === 'error')
          if (errorSeverity.length > 0) {
            const seen = errorSeverity.map(e => `${e.severity}/${e.code}`).join(', ')
            throw new Error(
              `render-divergence '${fixtureId}' on '${adapter.id}' no longer compiles clean (${seen}) — ` +
                `move it to conformancePins (build-time refusal) instead`,
            )
          }
        })
      }
    })
  }
})
