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
import { compileJSX } from '@barefootjs/jsx'
import { HonoAdapter } from '@barefootjs/hono/adapter'
import { jsxFixtures } from '../../fixtures'

const adapter = new HonoAdapter()

function compileClientJs(fixture: (typeof jsxFixtures)[number]): string {
  const result = compileJSX(fixture.source, 'Test.tsx', { adapter })
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
  // #1421: fallback branch is rendered at SSR (no `on` prop), but the
  // emitted client JS still wires up the truthy branch's `className`
  // slot. The marker for that slot doesn't appear in the falsy-branch
  // expectedHtml — same SSR/CSR-branch divergence that motivates
  // `if-statement` / `top-level-ternary`.
  'branch-local-filter-join',
  // Shared-component corpus (#1466). Same SSR/CSR-branch divergence as
  // the entries above — the SSR pass renders only the active branch
  // but the client JS bundle wires up markers for all branches:
  //   - `conditional-return-button`: top-level if/else picks the
  //     `<button>` branch at SSR; the emitted client JS still
  //     references the `<a>` branch's `s14` slot for hydration on
  //     re-render.
  //   - `todo-app`: `/* @client */` markers on the keyed `.map` and
  //     other expressions elide their slot markers from SSR; the
  //     client materialises them on init.
  //   - `ai-chat`: the streaming-cursor span only exists when
  //     `isStreaming()` is true; SSR with the default `false` state
  //     omits its marker but the client JS wires it up regardless.
  'conditional-return-button',
  'todo-app',
  'ai-chat',
  // Priority-12 edge-case sweep: same one-side-renders-less divergence as
  // `conditional-return-button` above — the three-branch if/else-if/else
  // chain's client JS wires marker ids for EVERY branch, but the SSR HTML
  // (rendered with `level: 'mid'`… normalised to the low branch) carries
  // only the rendered branch's ids.
  'else-if-chain',
  // #1448 Tier B — iteration shape fixtures are prop-based components
  // without signals. SSR renders them fully; no client JS is emitted.
  'array-entries',
  'array-keys',
  'array-values',
  // Demo corpus (#1467): demo sources export several sibling demos from
  // one file, and `compileClientJs` here compiles the whole source. The
  // expectedHtml renders only the pinned `componentName`
  // (`RadioGroupBasicDemo`), so the other exports' slot refs (e.g. the
  // form demo's `s8`) have no markers in it — same one-side-renders-less
  // divergence as `conditional-return-button` above. The frozen pair is
  // still exercised end-to-end by the fixture-hydrate runner.
  'radio-group',
  // #1467 Phase 2c: same multi-export demo-source divergence —
  // `accordion-demo.tsx`'s other exports wire markers the pinned
  // `AccordionSingleOpenDemo` HTML doesn't carry. (`tabs` passes this
  // test because its sibling demos' marker ids happen to all exist in
  // the pinned export's HTML, so it is intentionally NOT listed.)
  'accordion',
  // #1467 Phase 2c overlay: same multi-export divergence for the dialog
  // and popover demo files. (`tooltip` passes — its sibling demos reuse
  // the same marker ids — and is intentionally NOT listed, matching the
  // `tabs` note above.)
  'dialog',
  'popover',
  // #1467 Phase 2d: same multi-export divergence for the select and
  // combobox demo files. (`dropdown-menu` / `command` pass — their
  // sibling demos' marker ids all exist in the pinned export's HTML —
  // and are intentionally NOT listed, matching the `tabs` note above.)
  'select',
  'combobox',
  // #1467 Phase 2e: same multi-export divergence (`pagination` passes
  // and is intentionally NOT listed).
  'data-table',
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

        // Every renderChild call should have at least one matching child
        // scope in HTML. Per #1249 child bf-s carries the child's own
        // name (e.g. `Tag_*` or `Tag_*_sN`) so the per-slot correspondence
        // we used to assert is no longer one-to-one; the count-based
        // sanity check below is the looser invariant the contract test
        // can still pin without inventing per-call-site identity.
        if (renderChildSlots.length > 0) {
          expect(scopes.length).toBeGreaterThan(0)
        }
        void childScopes
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
      const result = compileJSX(source, 'Test.tsx', { adapter })
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
      const result = compileJSX(source, 'Test.tsx', { adapter })
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
