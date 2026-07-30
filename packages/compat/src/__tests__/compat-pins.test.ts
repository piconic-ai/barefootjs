// The consistency gate: every `conformancePins` entry an adapter package
// declares must (a) point at a real fixture in the shared corpus (catches
// stale pins left behind after a fixture is renamed/removed) and (b)
// actually reproduce the pinned diagnostic when compiled the same way the
// adapter's own conformance suite compiles it
// (`collectFixtureDiagnostics` — packages/adapter-tests/src/jsx-runner.ts).
//
// `jsxFixtures` is declared in packages/adapter-tests/fixtures/index.ts,
// not re-exported from the package's public index — a relative
// cross-package import from a test file is the existing repo precedent,
// see packages/adapter-mojolicious/src/__tests__/mojo-adapter.test.ts.
// packages/compat declares `@barefootjs/adapter-tests` as a devDependency
// (see packages/compat/package.json — this package is repo-internal, so
// depending on the harness package is fine), but `jsxFixtures` still
// isn't part of adapter-tests' public export map, so the relative import
// stays. This file does not modify adapter-tests — its adapter-import
// inversion (adapter-tests never imports an adapter) stays intact; only
// this package's own registry does that.

import { describe, test, expect } from 'bun:test'
import { jsxFixtures } from '../../../adapter-tests/fixtures'
import { loadCompatAdapters } from '../adapter-registry'
import { compileForCompat, buildCompatCell } from '../engine'

const { loaded, skipped } = await loadCompatAdapters()

describe('compat adapter registry', () => {
  test('every registered adapter package resolves in this monorepo', () => {
    expect(skipped).toEqual([])
  })
})

describe('conformancePins consistency', () => {
  for (const adapter of loaded) {
    describe(adapter.id, () => {
      const pinnedFixtureIds = Object.keys(adapter.pins)

      if (pinnedFixtureIds.length === 0) {
        test('declares no pins', () => {
          expect(pinnedFixtureIds).toEqual([])
        })
      } else {
        for (const fixtureId of pinnedFixtureIds) {
          test(`[${fixtureId}] pinned diagnostics are reproduced and the cell reflects them`, () => {
            const fixture = jsxFixtures.find(f => f.id === fixtureId)
            if (!fixture) {
              throw new Error(
                `stale pin: adapter '${adapter.id}' pins fixture '${fixtureId}', which does not exist in jsxFixtures`,
              )
            }

            const instance = adapter.factory()
            const errors = compileForCompat(fixture.source, 'component.tsx', instance, 'conformance', fixture.components)

            const expected = adapter.pins[fixtureId]
            for (const want of expected) {
              const hit = errors.some(e => e.code === want.code && e.severity === want.severity)
              if (!hit) {
                const seen = errors.map(e => `${e.severity}/${e.code}`).join(', ') || '(none)'
                throw new Error(
                  `[${adapter.id}/${fixtureId}] expected diagnostic ${want.severity}/${want.code} was not emitted. Seen: ${seen}`,
                )
              }
            }

            // Same semantics as buildCompatCell reads at report time: a
            // pin declaring an 'error' severity must make the derived
            // matrix cell non-ok — otherwise the lockfile would silently
            // show ✓ for a component the adapter actually refuses.
            if (expected.some(p => p.severity === 'error')) {
              const cell = buildCompatCell(errors, adapter.pins)
              expect(cell.ok).toBe(false)
            }
          })
        }
      }
    })
  }
})
