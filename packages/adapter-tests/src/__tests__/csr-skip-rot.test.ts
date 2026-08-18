/**
 * CSR skip-ledger rot test
 *
 * `CSR_SKIP_FIXTURES` (`../csr-skip-set.ts`) is a declaration that a fixture
 * is *currently broken* under CSR conformance — each entry's comment names
 * the known-limitation issue it's pinned to. Nothing forces that declaration
 * to stay true: a compiler fix can silently graduate a fixture (it now
 * passes CSR conformance) while the skip entry — and the known-limitation
 * issue it points at — keeps claiming the fixture is broken. That drift is
 * exactly what happened: a 2026-08 audit of this 53-entry ledger found 25
 * entries (nearly half) were stale, having quietly started passing — this
 * test is what caught them, and their graduation is what shrank the ledger
 * to its current size.
 *
 * This test generates one `test(...)` per skip entry (mirroring
 * `csr-conformance.test.ts`'s fixture loop) and asserts the entry is still
 * earning its keep:
 *   1. the id names a real fixture (catches orphans — an id that no longer
 *      exists in `jsxFixtures`, e.g. after a fixture rename/removal);
 *   2. that fixture carries `expectedHtml` to compare against;
 *   3. rendering it through the CSR path (`renderCsrComponent`) still
 *      diverges from `expectedHtml` — either by throwing, or by producing
 *      HTML that (after the same cross-adapter normalization
 *      `csr-conformance.test.ts` applies) does NOT match. If it DOES match,
 *      the entry is stale and this test fails, instructing the entry be
 *      deleted (and its tracking issue closed or updated).
 *
 * This is the skip-ledger twin of `data-point-conformance.ts`'s
 * `skipDataPoints` orphan check — same discipline, extended from "does the
 * entry still point at something real" to "is the thing it points at still
 * actually broken".
 */

import { describe, test, expect } from 'bun:test'
import { jsxFixtures } from '../../fixtures'
import { normalizeHTML, stripConditionalMarkersForCrossAdapter } from '../jsx-runner'
import { renderCsrComponent } from '../csr-render'
import { CSR_SKIP_FIXTURES } from '../csr-skip-set'

describe('CSR skip-ledger rot', () => {
  for (const id of CSR_SKIP_FIXTURES) {
    // Some fixtures (e.g. `data-table`, a large multi-export UI demo) take
    // several seconds to compile+render through the CSR harness, so staying
    // within bun's default 5s test timeout isn't guaranteed. A slow render
    // is not the same as "still broken"; give every entry generous headroom
    // so a timeout can't be misread as a stale-check result either way.
    test(`[${id}] skip entry is still earning its keep (fixture still diverges)`, async () => {
      const fixture = jsxFixtures.find(f => f.id === id)
      expect(fixture, `skip entry '${id}' names no fixture in jsxFixtures — orphaned entry, delete it`).toBeDefined()
      if (!fixture) return

      expect(
        fixture.expectedHtml,
        `skip entry '${id}' has no expectedHtml to compare against — cannot verify it's still broken`,
      ).toBeTruthy()
      if (!fixture.expectedHtml) return

      let html: string
      let threw = false
      try {
        html = await renderCsrComponent({
          source: fixture.source,
          // Same isolation as csr-conformance.test.ts: clone props per
          // render so a mutating fixture (.reverse()/.sort()) can't poison
          // the shared fixture.props object.
          props: fixture.props !== undefined ? structuredClone(fixture.props) : undefined,
          components: fixture.components,
        })
      } catch {
        threw = true
        html = ''
      }

      if (threw) return // still broken (throws) — entry is earning its keep

      const normalizedHtml = stripConditionalMarkersForCrossAdapter(normalizeHTML(html))
      const normalizedExpected = stripConditionalMarkersForCrossAdapter(normalizeHTML(fixture.expectedHtml))

      expect(
        normalizedHtml,
        `skip entry '${id}' is stale — the fixture now passes CSR conformance; delete the entry (and close/update its tracking issue)`,
      ).not.toBe(normalizedExpected)
    }, 20_000)
  }
})
