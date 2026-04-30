/**
 * Tests that bare references to props that were destructured *inside the
 * function body* (after a single `(props: Props)` arg) get rewritten to
 * `_p.X` in the generated client template, the same way directly-
 * destructured-arg props are rewritten.
 *
 * Before the fix, the rewriter short-circuited to `null` whenever the
 * function used the SolidJS-style `(props: Props)` shape, even if the
 * body still pulled out destructured locals. The standalone template
 * function (`_p => ...`) then referenced bare `org` / `projectNumber`
 * etc. which aren't in its closure, throwing
 * `ReferenceError: org is not defined` at hydration / `render()` time.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSXSync } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

describe('destructured-from-props-object → template rewrite', () => {
  test('bare references to props destructured from a `(props)` arg are rewritten to `_p.X` in the template', () => {
    const source = `
      'use client'

      interface Props {
        org: string
        projectNumber: number
      }

      export function Page(props: Props) {
        const { org, projectNumber } = props
        return (
          <div data-org={org} data-project-number={String(projectNumber)} />
        )
      }
    `

    const result = compileJSXSync(source, 'Page.tsx', { adapter })

    expect(result.errors).toHaveLength(0)
    const clientJs = result.files.find((f) => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    const content = clientJs?.content ?? ''

    const hydrateMatch = content.match(/hydrate\(['"]Page['"][\s\S]*?\}\)/)
    expect(hydrateMatch).not.toBeNull()
    const hydrateCall = hydrateMatch?.[0] ?? ''

    // Both data-* values must use the template's `_p.X` form, not the
    // destructured-local bare names that don't exist in the template's
    // standalone scope.
    expect(hydrateCall).toContain('_p.org')
    expect(hydrateCall).toContain('_p.projectNumber')

    // The bare names must NOT appear as standalone identifiers inside
    // the template — that's what triggers ReferenceError at runtime.
    // (We allow them in unrelated places like `data-org="${...}"` keys.)
    const templateMatch = hydrateCall.match(/template:\s*\(?_p\)?\s*=>\s*`([\s\S]*?)`\s*[,}]/)
    expect(templateMatch).not.toBeNull()
    const tmpl = templateMatch?.[1] ?? ''
    // Bare `org` value-position reference would look like `${org}` — must not appear.
    expect(tmpl).not.toMatch(/\$\{[\s]*org[\s.\}]/)
    expect(tmpl).not.toMatch(/\$\{[\s]*projectNumber[\s.\}]/)
  })
})
