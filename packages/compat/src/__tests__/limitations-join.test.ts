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
//       unless it is `by-design`, which is pinned forever by construction);
//   (e) no entry's `given` names an adapter by its id — affected adapters
//       are derived from the citations, never written into the entry. The
//       ids come from the loaded adapters, so this covers the ones whose id
//       differs from their package name (`minijinja`); package names are
//       checked by `limitations.test.ts` from the workspace listing;
//   (f) the real-browser e2e quarantine ledgers (`oracle-quarantine.ts`,
//       `mutation-quarantine.ts`, `pairwise-quarantine.ts`,
//       `fixture-hydrate-quarantine.ts`) are pin sites too, for the
//       SSR-vs-hydrated / csr-mount divergences no adapter declaration can
//       express. An oracle row is keyed by a corpus fixture and must cite
//       a `silent` entry listing it; a mutation row (a mutated fixture) or
//       a pairwise row (a generated case) must cite an existing `silent`
//       entry, nothing more. A fixture-hydrate-quarantine row is keyed by
//       a corpus fixture (its declared `interactions` are expected to
//       still fail) and must cite a `silent` entry listing it, same as an
//       oracle row.
//   (g) the client-JS scope gate's `KNOWN_UNDECLARED` ledger
//       (`client-js-scope-ledger.ts`) is a pin site of the same shape: a
//       row is keyed by a corpus fixture whose emitted client JS reads an
//       undeclared name, and must cite a `silent` entry listing it;
//   (h) every entry's published adapter list (`adaptersCiting`, fed the
//       pins, the render divergences and the e2e quarantine rows) is
//       non-empty — the docs page renders an empty list as "no adapter",
//       which would misreport a live gap as affecting nothing.
//
// Same `loadCompatAdapters()` precedent as compat-pins.test.ts.

import { describe, test, expect } from 'bun:test'
import { MUTATION_QUARANTINE } from '../../../adapter-tests/e2e/mutation-quarantine'
import { ORACLE_QUARANTINE } from '../../../adapter-tests/e2e/oracle-quarantine'
import { PAIRWISE_QUARANTINE } from '../../../adapter-tests/e2e/pairwise-quarantine'
import { EXPLORE_QUARANTINE } from '../../../adapter-tests/e2e/explore-quarantine'
import { FIXTURE_HYDRATE_QUARANTINE } from '../../../adapter-tests/e2e/fixture-hydrate-quarantine'
import { KNOWN_UNDECLARED } from '../../../adapter-tests/src/client-js-scope-ledger'
import { findLimitation, limitations } from '../../../adapter-tests/limitations'
import { limitationDiagnostics } from '../../../adapter-tests/src/limitations'
import { loadCompatAdapters } from '../adapter-registry'
import { adaptersCiting, e2eQuarantineCitations, type LimitationsAdapterInput } from '../limitations'
import { compareAdapterIds } from '../report'

const { loaded } = await loadCompatAdapters()
const e2eCitations = await e2eQuarantineCitations()

/** Corpus fixture ids the oracle quarantine cites under `limitationId`. */
function oracleFixturesCiting(limitationId: string): string[] {
  return Object.entries(ORACLE_QUARANTINE)
    .filter(([, entry]) => entry.limitation === limitationId)
    .map(([fixtureId]) => fixtureId)
}

/** Corpus fixture ids the fixture-hydrate quarantine cites under `limitationId`. */
function hydrateQuarantineFixturesCiting(limitationId: string): string[] {
  return Object.entries(FIXTURE_HYDRATE_QUARANTINE)
    .filter(([, entry]) => entry.limitation === limitationId)
    .map(([fixtureId]) => fixtureId)
}

/** Corpus fixture ids the client-JS scope gate's ledger cites under `limitationId`. */
function scopeGateFixturesCiting(limitationId: string): string[] {
  return Object.entries(KNOWN_UNDECLARED)
    .filter(([, hole]) => hole.limitation === limitationId)
    .map(([fixtureId]) => fixtureId)
}

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

  describe('e2e quarantine ledgers', () => {
    for (const [fixtureId, row] of Object.entries(ORACLE_QUARANTINE)) {
      if (!row.limitation) continue
      test(`[oracle:${fixtureId}] cites a registered silent limitation listing this fixture`, () => {
        const entry = findLimitation(row.limitation!)
        if (!entry) {
          throw new Error(
            `oracle-quarantine row '${fixtureId}' cites limitation '${row.limitation}', ` +
              `which has no entry under packages/adapter-tests/limitations/`,
          )
        }
        expect(entry.kind).toBe('silent')
        expect(entry.fixtures).toContain(fixtureId)
      })
    }
    for (const [key, row] of MUTATION_QUARANTINE) {
      if (!row.limitation) continue
      test(`[mutation:${key}] cites a registered silent limitation`, () => {
        const entry = findLimitation(row.limitation!)
        if (!entry) {
          throw new Error(
            `mutation-quarantine row '${key}' cites limitation '${row.limitation}', ` +
              `which has no entry under packages/adapter-tests/limitations/`,
          )
        }
        expect(entry.kind).toBe('silent')
      })
    }
    for (const [key, row] of PAIRWISE_QUARANTINE) {
      if (!row.limitation) continue
      test(`[pairwise:${key}] cites a registered silent limitation`, () => {
        const entry = findLimitation(row.limitation!)
        if (!entry) {
          throw new Error(
            `pairwise-quarantine row '${key}' cites limitation '${row.limitation}', ` +
              `which has no entry under packages/adapter-tests/limitations/`,
          )
        }
        expect(entry.kind).toBe('silent')
      })
    }
    for (const [key, row] of EXPLORE_QUARANTINE) {
      test(`[explore:${key}] cites a registered silent limitation`, () => {
        const entry = findLimitation(row.limitation)
        if (!entry) {
          throw new Error(
            `explore-quarantine row '${key}' cites limitation '${row.limitation}', ` +
              `which has no entry under packages/adapter-tests/limitations/`,
          )
        }
        expect(entry.kind).toBe('silent')
      })
    }
    for (const [fixtureId, row] of Object.entries(FIXTURE_HYDRATE_QUARANTINE)) {
      test(`[fixture-hydrate:${fixtureId}] cites a registered silent limitation listing this fixture`, () => {
        const entry = findLimitation(row.limitation)
        if (!entry) {
          throw new Error(
            `fixture-hydrate-quarantine row '${fixtureId}' cites limitation '${row.limitation}', ` +
              `which has no entry under packages/adapter-tests/limitations/`,
          )
        }
        expect(entry.kind).toBe('silent')
        expect(entry.fixtures).toContain(fixtureId)
      })
    }
  })

  describe('client-JS scope gate ledger', () => {
    for (const [fixtureId, hole] of Object.entries(KNOWN_UNDECLARED)) {
      test(`[scope-gate:${fixtureId}] cites a registered silent limitation listing this fixture`, () => {
        const entry = findLimitation(hole.limitation)
        if (!entry) {
          throw new Error(
            `KNOWN_UNDECLARED row '${fixtureId}' cites limitation '${hole.limitation}', ` +
              `which has no entry under packages/adapter-tests/limitations/`,
          )
        }
        expect(entry.kind).toBe('silent')
        expect(entry.fixtures).toContain(fixtureId)
      })
    }
  })

  for (const entry of limitations) {
    test(`[${entry.id}] given names no adapter id`, () => {
      const lower = entry.given.toLowerCase()
      const named = loaded
        .map(a => a.id)
        .filter(id => new RegExp(`(^|[^a-z-])${id}([^a-z-]|$)`).test(lower))
      expect(named).toEqual([])
    })

    test(`[${entry.id}] publishes at least one affected adapter`, () => {
      expect(adaptersCiting(entry.id, loaded, e2eCitations)).not.toEqual([])
    })

    test(`[${entry.id}] every listed fixture is pinned, divergent, or e2e-quarantined under this id`, () => {
      const quarantined = new Set([
        ...oracleFixturesCiting(entry.id),
        ...hydrateQuarantineFixturesCiting(entry.id),
        ...scopeGateFixturesCiting(entry.id),
      ])
      const orphaned = entry.fixtures.filter(fixtureId => {
        if (quarantined.has(fixtureId)) return false
        return !loaded.some(adapter => {
          const pinned = (adapter.pins[fixtureId] ?? []).some(p => p.limitation === entry.id)
          const divergent = adapter.renderDivergences[fixtureId]?.limitation === entry.id
          return pinned || divergent
        })
      })
      if (orphaned.length > 0) {
        throw new Error(
          `limitation '${entry.id}' lists fixture(s) [${orphaned.join(', ')}] that no adapter pins, no ` +
            `render divergence declares, and no oracle-quarantine / fixture-hydrate-quarantine / scope-gate row cites under it ` +
            `— either the fixture graduated (drop it from the entry; delete the entry when its list empties) or a ` +
            `pin cites the wrong id.`,
        )
      }
    })
  }
})

describe('e2e quarantine citations', () => {
  const adapter = (id: string, fixture?: 'pin' | 'divergence'): LimitationsAdapterInput => ({
    id,
    pins: fixture === 'pin' ? { f: [{ code: 'BF101', severity: 'error', limitation: 'other' }] } : {},
    renderDivergences: fixture === 'divergence' ? { f: { limitation: 'other' } } : {},
  })

  test('a fixture-keyed row covers every adapter rendering that fixture as the reference does', () => {
    const adapters = [adapter('hono'), adapter('erb'), adapter('go-template', 'pin'), adapter('jinja', 'divergence')]
    expect(adaptersCiting('x', adapters, [{ adapter: 'hono', limitation: 'x', fixture: 'f' }])).toEqual(['hono', 'erb'])
  })

  test('a generated-case row covers only its own run adapter', () => {
    const adapters = [adapter('hono'), adapter('erb')]
    expect(adaptersCiting('x', adapters, [{ adapter: 'erb', limitation: 'x' }, { adapter: 'hono', limitation: 'y' }])).toEqual([
      'erb',
    ])
  })

  for (const citation of e2eCitations.filter(c => c.fixture !== undefined)) {
    const fixture = citation.fixture as string
    test(`[${citation.limitation}] publishes every adapter rendering '${fixture}' as the reference does`, () => {
      const conforming = loaded
        .filter(a => (a.pins[fixture] ?? []).length === 0 && !a.renderDivergences[fixture])
        .map(a => a.id)
      const published = adaptersCiting(citation.limitation, loaded, e2eCitations)
      expect(conforming.filter(id => !published.includes(id))).toEqual([])
    })
  }

  test('loop-row-ref-portal publishes every adapter', () => {
    expect(adaptersCiting('loop-row-ref-portal', loaded, e2eCitations)).toEqual(loaded.map(a => a.id).sort(compareAdapterIds))
  })
})
