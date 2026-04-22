/**
 * SSR-Hydration Contract Tests
 *
 * Verifies that SSR HTML output (expectedHtml from fixtures) and client JS
 * agree on attribute conventions. A mismatch means hydration will silently
 * fail at runtime.
 *
 * Uses expectedHtml (the rendered HTML) as the SSR side, and compiles the
 * fixture to get client JS for the hydration side.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSXSync } from '@barefootjs/jsx'
import { HonoAdapter } from '@barefootjs/hono/adapter'
import { jsxFixtures } from '../../fixtures'

const adapter = new HonoAdapter()

function compileClientJs(fixture: (typeof jsxFixtures)[number]): string {
  const result = compileJSXSync(fixture.source, 'Test.tsx', { adapter })
  return result.files.find(f => f.type === 'clientJs')?.content ?? ''
}

/** Extract bf="sN" slot IDs from rendered HTML */
function extractSlotIds(html: string): string[] {
  const matches = html.matchAll(/\bbf="(\^?s\d+)"/g)
  return [...matches].map(m => m[1])
}

/** Extract $(..., 'sN') and $(..., '^sN') slot references from client JS */
function extractClientSlotRefs(js: string): string[] {
  const matches = js.matchAll(/\$\([^,]+,\s*'(\^?s\d+)'/g)
  return [...matches].map(m => m[1])
}

/** Extract $t(..., 'sN') text node references from client JS.
 *  Only matches top-level scope refs (__scope, __branchScope) — loop-item
 *  $t refs (scoped to __el) live inside renderItem templates and have no
 *  corresponding markers in the top-level SSR HTML. */
function extractClientTextRefs(js: string): string[] {
  const matches = js.matchAll(/\$t\((?:__scope|__branchScope)[^,]*,\s*'(\^?s\d+)'/g)
  return [...matches].map(m => m[1])
}

/** Extract insert(scope, 'sN', ...) conditional slot references from client JS */
function extractClientInsertRefs(js: string): string[] {
  const matches = js.matchAll(/insert\([^,]+,\s*'(s\d+)'/g)
  return [...matches].map(m => m[1])
}

/** Extract bf-s="..." scope IDs from rendered HTML */
function extractScopeIds(html: string): string[] {
  const matches = html.matchAll(/\bbf-s="([^"]+)"/g)
  return [...matches].map(m => m[1])
}

/** Extract <!--bf:sN--> comment marker IDs from rendered HTML */
function extractTextMarkers(html: string): string[] {
  const matches = html.matchAll(/<!--bf:(s\d+)-->/g)
  return [...matches].map(m => m[1])
}

/** Extract conditional marker IDs from rendered HTML (bf-c="sN" and <!--bf-cond-start:sN-->) */
function extractCondMarkers(html: string): string[] {
  const bfcMatches = html.matchAll(/\bbf-c="(s\d+)"/g)
  const condStartMatches = html.matchAll(/<!--bf-cond-start:(s\d+)-->/g)
  return [...new Set([...[...bfcMatches].map(m => m[1]), ...[...condStartMatches].map(m => m[1])])]
}

// Stateless fixtures have no client JS — skip.
// if-statement, top-level-ternary: SSR renders one branch but client JS
// references markers from all branches.
const statelessFixtures = new Set([
  'props-static',
  'nested-elements',
  'void-elements',
  'class-vs-classname',
  'style-attribute',
  'fragment',
  'default-props',
  'child-component',
  'static-array-children',
  'if-statement',
  'top-level-ternary',
])

describe('SSR-Hydration Contract', () => {
  describe('slot and text marker IDs: HTML ↔ client JS', () => {
    for (const fixture of jsxFixtures) {
      if (statelessFixtures.has(fixture.id)) continue
      if (!fixture.expectedHtml) continue

      test(`[${fixture.id}] every HTML marker is referenced by client JS`, () => {
        const clientJs = compileClientJs(fixture)
        if (!clientJs) return

        const htmlSlots = extractSlotIds(fixture.expectedHtml!)
        const htmlTextMarkers = extractTextMarkers(fixture.expectedHtml!)
        const htmlCondMarkers = extractCondMarkers(fixture.expectedHtml!)

        const jsSlots = extractClientSlotRefs(clientJs)
        const jsTextRefs = extractClientTextRefs(clientJs)
        const jsInsertRefs = extractClientInsertRefs(clientJs)

        // All IDs present in HTML
        const allHtmlIds = new Set([...htmlSlots, ...htmlTextMarkers, ...htmlCondMarkers])

        // Verify: every $() and $t() reference in client JS has a matching
        // bf="sN" or <!--bf:sN--> in the HTML. This direction (JS → HTML)
        // catches missing SSR markers that would cause null lookups at runtime.
        // The reverse direction (HTML → JS) is not checked because not all HTML
        // markers are accessed via $/$t (some are used for addEventListener,
        // child component init, or structural purposes).
        for (const ref of jsSlots) {
          expect(allHtmlIds).toContain(ref)
        }
        for (const ref of jsTextRefs) {
          expect(allHtmlIds).toContain(ref)
        }
        for (const ref of jsInsertRefs) {
          expect(allHtmlIds).toContain(ref)
        }
      })
    }
  })

  describe('child scopes: bf-s="test_sN" in HTML ↔ renderChild(..., "sN") in client JS', () => {
    for (const fixture of jsxFixtures) {
      if (statelessFixtures.has(fixture.id)) continue
      if (!fixture.expectedHtml) continue

      test(`[${fixture.id}]`, () => {
        const clientJs = compileClientJs(fixture)
        if (!clientJs) return

        // Extract child scope IDs from HTML (bf-s="test_sN" patterns)
        const scopes = extractScopeIds(fixture.expectedHtml!)
        const childScopes = scopes.filter(s => s.startsWith('test_'))

        // Extract renderChild slot suffixes from client JS
        const renderChildMatches = clientJs.matchAll(/renderChild\([^)]*,\s*'(s\d+)'\)/g)
        const renderChildSlots = [...renderChildMatches].map(m => m[1])

        // Every renderChild slot should have a corresponding bf-s in HTML
        for (const slot of renderChildSlots) {
          const hasMatchingScope = childScopes.some(s =>
            s === `test_${slot}` ||
            s.startsWith(`~`) && s.endsWith(`_${slot}`)
          )
          expect(hasMatchingScope).toBe(true)
        }
      })
    }
  })

  describe('className preserved in marked template JSX output (#773)', () => {
    test('static className remains className (not class) in marked template', () => {
      const source = `
export function Test() {
  return <div className="container"><span className="label">Text</span></div>
}
`
      const result = compileJSXSync(source, 'Test.tsx', { adapter })
      const template = result.files.find(f => f.type === 'markedTemplate')!

      expect(template.content).toContain('className="container"')
      expect(template.content).toContain('className="label"')
      expect(template.content).not.toContain('class="container"')
      expect(template.content).not.toContain('class="label"')
    })

    test('dynamic className remains className in marked template', () => {
      const source = `
'use client'
import { createSignal } from '@barefootjs/client'
export function Test() {
  const [active, setActive] = createSignal(false)
  return <div className={active() ? 'on' : 'off'}>Toggle</div>
}
`
      const result = compileJSXSync(source, 'Test.tsx', { adapter })
      const template = result.files.find(f => f.type === 'markedTemplate')!

      expect(template.content).toContain('className=')
      expect(template.content).not.toMatch(/\bclass=/)
    })
  })

  describe('key attribute: data-key in client JS ↔ .map() in source', () => {
    for (const fixture of jsxFixtures) {
      if (statelessFixtures.has(fixture.id)) continue

      test(`[${fixture.id}]`, () => {
        const clientJs = compileClientJs(fixture)
        if (!clientJs) return

        // If client JS references data-key, source must have a .map() call
        if (clientJs.includes('data-key')) {
          expect(fixture.source).toMatch(/\.map\s*\(/)
        }
      })
    }
  })
})
