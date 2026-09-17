// The join between the known-limitation registry
// (`packages/adapter-tests/limitations/`) and the adapters' declarations
// (`conformancePins` / `renderDivergences`) — the half of the registry's
// consistency that needs every adapter loaded (the entry-shape lint lives
// in `packages/adapter-tests/src/__tests__/limitations.test.ts`).
//
// An entry declares WHAT a limitation is and which fixtures reproduce it;
// a pin declares WHERE it bites. The two overlap on `(limitation id,
// fixture id)`, and this test pins that overlap from both sides so neither
// can drift:
//
//   (a) every pin / divergence cites an id that exists in the registry
//       (a typo, or an entry deleted while its pins remain);
//   (b) a pin cites a `refusal` / `by-design` entry and its code is one the
//       entry declares; a render divergence cites a `silent` entry
//       (the kinds ARE the behaviour, so a mismatch is a misclassification);
//   (c) the pinned fixture is in the cited entry's `fixtures`
//       (the entry's repro list is complete);
//   (d) every fixture an entry lists is pinned / divergent under that id on
//       at least one adapter (the entry is executable: nothing it names has
//       silently graduated — when the last pin goes, the entry goes too,
//       unless it is `by-design`, which is pinned forever by construction).
//
// Same `loadCompatAdapters()` precedent as compat-pins.test.ts.

import { describe, test, expect } from 'bun:test'
import { findLimitation, limitations } from '../../../adapter-tests/limitations'
import { limitationDiagnostics } from '../../../adapter-tests/src/limitations'
import { loadCompatAdapters } from '../adapter-registry'

const { loaded } = await loadCompatAdapters()

describe('limitation registry ↔ adapter declarations', () => {
  for (const adapter of loaded) {
    describe(adapter.id, () => {
      for (const [fixtureId, pins] of Object.entries(adapter.pins)) {
        for (const pin of pins) {
          test(`[${fixtureId}] ${pin.code} pin cites a registered refusal limitation listing this fixture`, () => {
            const entry = findLimitation(pin.limitation)
            if (!entry) {
              throw new Error(
                `pin '${fixtureId}' (${pin.code}) on '${adapter.id}' cites limitation '${pin.limitation}', ` +
                  `which has no entry under packages/adapter-tests/limitations/`,
              )
            }
            expect(entry.kind).not.toBe('silent')
            expect(limitationDiagnostics(entry)).toContain(pin.code)
            expect(entry.fixtures).toContain(fixtureId)
          })
        }
      }

      for (const [fixtureId, divergence] of Object.entries(adapter.renderDivergences)) {
        test(`[${fixtureId}] render divergence cites a registered silent limitation listing this fixture`, () => {
          const entry = findLimitation(divergence.limitation)
          if (!entry) {
            throw new Error(
              `render divergence '${fixtureId}' on '${adapter.id}' cites limitation '${divergence.limitation}', ` +
                `which has no entry under packages/adapter-tests/limitations/`,
            )
          }
          expect(entry.kind).toBe('silent')
          expect(entry.fixtures).toContain(fixtureId)
        })
      }
    })
  }

  for (const entry of limitations) {
    test(`[${entry.id}] every listed fixture is pinned or divergent under this id on at least one adapter`, () => {
      const orphaned = entry.fixtures.filter(fixtureId => {
        return !loaded.some(adapter => {
          const pinned = (adapter.pins[fixtureId] ?? []).some(p => p.limitation === entry.id)
          const divergent = adapter.renderDivergences[fixtureId]?.limitation === entry.id
          return pinned || divergent
        })
      })
      if (orphaned.length > 0) {
        throw new Error(
          `limitation '${entry.id}' lists fixture(s) [${orphaned.join(', ')}] that no adapter pins under it — ` +
            `either the fixture graduated (drop it from the entry; delete the entry when its list empties) ` +
            `or a pin cites the wrong id.`,
        )
      }
    })
  }
})
