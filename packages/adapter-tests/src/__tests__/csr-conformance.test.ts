/**
 * CSR Conformance Tests
 *
 * Verifies that CSR template HTML output matches HonoAdapter reference output.
 * For each JSX fixture, compiles to client JS, evaluates the template function,
 * and compares the resulting HTML against the fixture's expectedHtml.
 */

import { describe, test, expect } from 'bun:test'
import { jsxFixtures } from '../../fixtures'
import { normalizeHTML } from '../jsx-runner'
import { renderCsrComponent } from '../csr-render'

describe('CSR Conformance Tests', () => {
  // Fixtures to skip in CSR conformance tests.
  // Each entry documents why the fixture cannot be tested in CSR mode.
  const skipFixtures = new Set([
    // Stateless components: no client JS emitted (fully server-rendered)
    'props-static',
    'nested-elements',
    'void-elements',
    'class-vs-classname',
    'style-attribute',
    'fragment',
    'default-props',
    // Local array variable (items) is not available at CSR template module scope.
    // CSR templates only have access to props and signals, not file-scope constants.
    'static-array-children',
    // Static style object is converted at compile time — no runtime needed.
    // Attribute ordering differs between SSR (style first) and CSR injection (bf-s first).
    'style-object-static',
  ])

  for (const fixture of jsxFixtures) {
    if (skipFixtures.has(fixture.id)) continue
    if (!fixture.expectedHtml) continue

    test(`[${fixture.id}] ${fixture.description}`, async () => {
      const html = await renderCsrComponent({
        source: fixture.source,
        props: fixture.props,
        components: fixture.components,
      })

      expect(html).toBeTruthy()

      const normalizedHtml = normalizeHTML(html)
      expect(normalizedHtml).toBe(fixture.expectedHtml!)
    })
  }
})
