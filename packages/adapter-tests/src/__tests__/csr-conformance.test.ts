/**
 * CSR Conformance Tests
 *
 * Verifies that CSR template HTML output matches HonoAdapter reference output.
 * For each JSX fixture, compiles to client JS, evaluates the template function,
 * and compares the resulting HTML against the fixture's expectedHtml.
 */

import { describe, test, expect } from 'bun:test'
import { jsxFixtures } from '../../fixtures'
import { normalizeHTML, stripConditionalMarkersForCrossAdapter } from '../jsx-runner'
import { renderCsrComponent } from '../csr-render'
import { CSR_SKIP_FIXTURES } from '../csr-skip-set'

describe('CSR Conformance Tests', () => {
  // Fixtures to skip in CSR conformance tests — see `../csr-skip-set.ts`
  // for the full set and per-entry rationale (extracted, #2613, so
  // `escape-coverage.test.ts`'s tier-2 check can read the same set).
  const skipFixtures = CSR_SKIP_FIXTURES

  for (const fixture of jsxFixtures) {
    if (skipFixtures.has(fixture.id)) continue
    if (!fixture.expectedHtml) continue

    test(`[${fixture.id}] ${fixture.description}`, async () => {
      const html = await renderCsrComponent({
        source: fixture.source,
        // Clone props per render so a mutating method in the fixture
        // source (`.reverse()`, `.sort()`) doesn't poison the shared
        // `fixture.props` object across SSR and CSR runs. Mirrors the
        // same isolation in `jsx-runner.ts` for the SSR side.
        props: fixture.props !== undefined ? structuredClone(fixture.props) : undefined,
        components: fixture.components,
      })

      expect(html).toBeTruthy()

      // Strip the conditional-branch marker divergence (#1266) on both
      // sides so the Go comment-pair form and the Hono bf-c attribute
      // form collapse to the same canonical shape. `normalizeHTML`
      // intentionally preserves both forms so the canonical fixture
      // HTML (and the SSR-hydration contract test that reads it) keeps
      // the SSR-side markers; cross-adapter collapsing happens only
      // here at compare time.
      const normalizedHtml = stripConditionalMarkersForCrossAdapter(normalizeHTML(html))
      const normalizedExpected = stripConditionalMarkersForCrossAdapter(normalizeHTML(fixture.expectedHtml!))
      expect(normalizedHtml).toBe(normalizedExpected)
    })
  }
})
