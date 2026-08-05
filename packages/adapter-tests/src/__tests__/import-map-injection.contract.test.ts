/**
 * Cross-adapter importmap-injection contract.
 *
 * Every shipping adapter must expose a way to inject an externals manifest's
 * importmap (+ modulepreloads) into the page <head>, so an app's configured
 * externals resolve in the browser (issues #1639 / #1644). This test runs
 * the shared `assertImportMapInjectionContract` against each adapter's real
 * machinery:
 *
 *   - Hono ('component')    → renders `BfImportMap`
 *   - Go / Mojo ('html-snippet') → renders the static `barefoot-importmap.html`
 *     snippet an app would render via `renderImportMapHtml`
 *
 * Adding a new adapter means adding it to `ADAPTERS` below — the contract then
 * forces it to declare an injection strategy and actually consume the manifest,
 * so a missing injection point fails here instead of silently 404ing externals.
 */
import { describe, test, expect } from 'bun:test'
import { renderImportMapHtml, type ExternalsManifest } from '@barefootjs/jsx'
// Import adapters via the `/adapter` subpath: each package's root `.` export
// resolves to its (unbuilt) `dist/`, while `/adapter` resolves to `src/`.
import { goTemplateAdapter } from '@barefootjs/go-template/adapter'
import { mojoAdapter } from '@barefootjs/mojolicious/adapter'
import { honoAdapter } from '@barefootjs/hono/adapter'
import { BfImportMap } from '@barefootjs/hono/app'
import {
  assertImportMapInjectionContract,
  type ImportMapInjectionFacts,
} from '../import-map-injection.contract'

// A representative manifest for a project whose externals config resolves
// `zod` against `/static/components/`.
const BASE = '/static/components'
const MANIFEST: ExternalsManifest = {
  importmap: {
    imports: {
      '@barefootjs/client': `${BASE}/barefoot.js`,
      '@barefootjs/client/runtime': `${BASE}/barefoot.js`,
      zod: 'https://esm.sh/zod@4.4.3',
    },
  },
  preloads: ['https://esm.sh/zod@4.4.3'],
  externals: ['zod', '@barefootjs/client', '@barefootjs/client/runtime'],
}

const EXTERNAL_SPECIFIER = 'https://esm.sh/zod@4.4.3'

// Each adapter computes its injected markup from its OWN machinery — the
// template-string adapters via the build-emitted snippet, the component adapter
// via its render-time component — so the contract exercises the real path.
const ADAPTERS: { name: string; facts: () => ImportMapInjectionFacts }[] = [
  {
    name: 'go-template',
    facts: () => ({
      adapterName: goTemplateAdapter.name,
      strategy: goTemplateAdapter.importMapInjection,
      renderedImportMap: renderImportMapHtml(MANIFEST),
      externalSpecifier: EXTERNAL_SPECIFIER,
    }),
  },
  {
    name: 'mojolicious',
    facts: () => ({
      adapterName: mojoAdapter.name,
      strategy: mojoAdapter.importMapInjection,
      renderedImportMap: renderImportMapHtml(MANIFEST),
      externalSpecifier: EXTERNAL_SPECIFIER,
    }),
  },
  {
    name: 'hono',
    facts: () => ({
      adapterName: honoAdapter.name,
      strategy: honoAdapter.importMapInjection,
      renderedImportMap: String(BfImportMap({ base: BASE, externals: MANIFEST })),
      externalSpecifier: EXTERNAL_SPECIFIER,
    }),
  },
]

describe('importmap-injection contract', () => {
  for (const { name, facts } of ADAPTERS) {
    test(`${name} satisfies the contract`, () => {
      assertImportMapInjectionContract(facts())
    })
  }

  // Direct per-adapter strategy assertions so a regression points at the exact
  // adapter rather than just the contract surface.
  test('go-template and mojolicious are html-snippet, hono is component', () => {
    expect(goTemplateAdapter.importMapInjection).toBe('html-snippet')
    expect(mojoAdapter.importMapInjection).toBe('html-snippet')
    expect(honoAdapter.importMapInjection).toBe('component')
  })
})
