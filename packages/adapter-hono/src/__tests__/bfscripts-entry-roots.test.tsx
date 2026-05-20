/** @jsxImportSource hono/jsx */
/**
 * BfScripts `entryRoots` prop (#1431).
 *
 * Background: `<BfScripts manifest base />` walks `stubDeps` only for
 * components whose SSR template ran during the request (the
 * `bfOutputScripts` set populated by `addScriptCollection`'s injected
 * snippet). A page that renders a `'use client'` component via a
 * manual `<script type="module">import "X.client.js"; render(root, "X", props)`
 * bootstrap — instead of SSR'ing `<X />` — never lands `X` in
 * `bfOutputScripts`. BfScripts has no root to walk, and `X`'s
 * `stubDeps` (children reached only through the imperative
 * `createComponent` stub rewrite, #1240) never ship as `<script>` tags.
 *
 * `entryRoots` lets the caller declare those manually-mounted entry
 * components so their `stubDeps` get walked. The caller's own inline
 * `<script type="module">` handles `X.client.js`, so `X` itself stays
 * in the `excluded` set — only its deps get emitted.
 *
 * Real-world: piconic-ai/desk #86 — `DeskCanvasPage` skips SSR of
 * `<DeskCanvas />` (its template body calls `useYjs()` / `fetch()` —
 * fatal on Cloudflare Workers) and manually mounts via the inline
 * script. Without `entryRoots`, `IssueCardNodeImpl.client.js` (reached
 * via `DeskCanvas → IssueCardNode (.ts) → IssueCardNodeImpl (.tsx)`)
 * doesn't ship, and the runtime renders the red `[IssueCardNodeImpl]`
 * placeholder for every card.
 */

import { describe, test, expect } from 'bun:test'
import { Hono } from 'hono'
import { jsxRenderer } from 'hono/jsx-renderer'
import { BfScripts } from '../scripts'
import type { BarefootBuildManifest } from '../app'

const MANIFEST: BarefootBuildManifest = {
  __barefoot__: { clientJs: 'components/barefoot.js' },
  'canvas/DeskCanvas': {
    clientJs: 'components/canvas/DeskCanvas.client.js',
    stubDeps: ['canvas/nodes/IssueCardNodeImpl'],
  },
  'canvas/nodes/IssueCardNodeImpl': {
    clientJs: 'components/canvas/nodes/IssueCardNodeImpl.client.js',
  },
  'canvas/catalog/IssueCardCatalog': {
    clientJs: 'components/canvas/catalog/IssueCardCatalog.client.js',
    stubDeps: ['canvas/nodes/IssueCardNodeImpl'],
  },
}

function mountApp(entryRoots?: string[]) {
  const app = new Hono()
  app.use(
    '*',
    jsxRenderer(({ children }) => (
      <html lang="en">
        <body>
          {children}
          <BfScripts manifest={MANIFEST} base="/static/components/" entryRoots={entryRoots} />
        </body>
      </html>
    )),
  )
  app.get('/', (c) => c.render(<div id="canvas-root" />))
  return app
}

describe('BfScripts entryRoots (#1431)', () => {
  test('omitted entryRoots → manually-mounted components miss their stubDeps (baseline regression)', async () => {
    const res = await mountApp().fetch(new Request('http://localhost/'))
    const html = await res.text()
    // DeskCanvas isn't in `bfOutputScripts` (no SSR), and we passed no
    // entryRoots, so its stubDep IssueCardNodeImpl is NOT emitted.
    expect(html).not.toContain('IssueCardNodeImpl.client.js')
  })

  test('entryRoots: ["canvas/DeskCanvas"] → walks its stubDeps even though it was not SSR-rendered', async () => {
    const res = await mountApp(['canvas/DeskCanvas']).fetch(new Request('http://localhost/'))
    const html = await res.text()
    // The whole point of #1431: the manually-mounted root's stubDeps
    // get emitted as `<script type="module" src=...>` tags.
    expect(html).toContain('/static/components/canvas/nodes/IssueCardNodeImpl.client.js')
  })

  test('entryRoots does NOT emit a script for the root itself (caller already does that via the inline mount)', async () => {
    const res = await mountApp(['canvas/DeskCanvas']).fetch(new Request('http://localhost/'))
    const html = await res.text()
    // The caller's own inline `<script type="module">import "DeskCanvas.client.js"`
    // already loads the root; BfScripts must NOT add a duplicate
    // `<script src=...DeskCanvas.client.js>` that would re-run hydration.
    expect(html).not.toContain('/static/components/canvas/DeskCanvas.client.js')
  })

  test('multiple entryRoots are all walked', async () => {
    const res = await mountApp(['canvas/DeskCanvas', 'canvas/catalog/IssueCardCatalog']).fetch(
      new Request('http://localhost/'),
    )
    const html = await res.text()
    // Both roots share the same stubDep; it must be emitted (once is fine
    // because the underlying walker dedupes against `excluded`/`visited`).
    const occurrences = html.match(/IssueCardNodeImpl\.client\.js/g) ?? []
    expect(occurrences.length).toBe(1)
  })

  test('an entry name listed in BOTH outputSet and entryRoots is not double-emitted as a script tag', async () => {
    // Simulate the case where the caller's manually-mounted root ALSO
    // happens to be SSR'd elsewhere (unusual but legal). The script
    // for the root itself stays out (the caller's inline mount handles
    // it / outputSet excludes it), and the stubDep emits once.
    const app = new Hono()
    app.use(
      '*',
      jsxRenderer(({ children }) => (
        <html lang="en">
          <body>
            {children}
            <BfScripts manifest={MANIFEST} base="/static/components/" entryRoots={['canvas/DeskCanvas']} />
          </body>
        </html>
      )),
    )
    app.get('/', (c) => {
      // Simulate addScriptCollection having pushed DeskCanvas during SSR.
      const set: Set<string> = c.get('bfOutputScripts') || new Set()
      set.add('canvas/DeskCanvas')
      c.set('bfOutputScripts', set)
      return c.render(<div id="canvas-root" />)
    })
    const res = await app.fetch(new Request('http://localhost/'))
    const html = await res.text()
    const deskMatches = html.match(/DeskCanvas\.client\.js/g) ?? []
    const implMatches = html.match(/IssueCardNodeImpl\.client\.js/g) ?? []
    expect(deskMatches.length).toBe(0)
    expect(implMatches.length).toBe(1)
  })
})
