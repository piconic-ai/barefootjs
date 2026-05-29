/**
 * BfImportMap tests
 *
 * Verifies the importmap merges configured externals from
 * `barefoot-externals.json` (issue #1639) and emits modulepreload
 * links, while preserving the pre-#1639 `@barefootjs/client*` defaults
 * when no externals are passed.
 */
import { describe, test, expect } from 'bun:test'
import { BfImportMap } from '../app'
import type { ImportMapManifest } from '@barefootjs/jsx'

function parseImportMap(html: string): Record<string, string> {
  const match = html.match(/<script type="importmap">(.*?)<\/script>/s)
  if (!match) throw new Error(`no importmap in: ${html}`)
  return JSON.parse(match[1]).imports
}

describe('BfImportMap', () => {
  test('emits @barefootjs/client defaults when no externals passed', () => {
    const html = String(BfImportMap({ base: '/components' }))
    expect(parseImportMap(html)).toEqual({
      '@barefootjs/client': '/components/barefoot.js',
      '@barefootjs/client/runtime': '/components/barefoot.js',
    })
    expect(html).not.toContain('modulepreload')
  })

  test('strips trailing slash from base', () => {
    const html = String(BfImportMap({ base: '/components/' }))
    expect(parseImportMap(html)['@barefootjs/client']).toBe('/components/barefoot.js')
  })

  test('merges externals importmap on top of the client defaults', () => {
    const externals: ImportMapManifest = {
      importmap: {
        imports: {
          zod: 'https://esm.sh/zod@4.4.3',
          '@barefootjs/form': '/components/form.js',
        },
      },
      preloads: [],
    }
    const imports = parseImportMap(String(BfImportMap({ base: '/components', externals })))
    expect(imports).toEqual({
      '@barefootjs/client': '/components/barefoot.js',
      '@barefootjs/client/runtime': '/components/barefoot.js',
      zod: 'https://esm.sh/zod@4.4.3',
      '@barefootjs/form': '/components/form.js',
    })
  })

  test('manifest @barefootjs/client mapping wins over the prop-derived one', () => {
    const externals: ImportMapManifest = {
      importmap: { imports: { '@barefootjs/client': '/vendor/barefoot.js' } },
    }
    const imports = parseImportMap(String(BfImportMap({ base: '/components', externals })))
    expect(imports['@barefootjs/client']).toBe('/vendor/barefoot.js')
  })

  test('emits modulepreload links for manifest preloads', () => {
    const externals: ImportMapManifest = {
      importmap: { imports: {} },
      preloads: ['/components/form.js', 'https://esm.sh/zod@4.4.3'],
    }
    const html = String(BfImportMap({ base: '/components', externals }))
    expect(html).toContain('<link rel="modulepreload" href="/components/form.js" crossorigin>')
    expect(html).toContain('<link rel="modulepreload" href="https://esm.sh/zod@4.4.3" crossorigin>')
  })

  test('emits crossorigin on modulepreload so cross-origin CDN preloads are reused', () => {
    const externals: ImportMapManifest = {
      preloads: ['https://esm.sh/zod@4.4.3'],
    }
    const html = String(BfImportMap({ base: '/components', externals }))
    const match = html.match(/<link rel="modulepreload"[^>]*>/)
    expect(match?.[0]).toContain('crossorigin')
  })

  test('preload=false suppresses modulepreload links', () => {
    const externals: ImportMapManifest = {
      preloads: ['/components/form.js'],
    }
    const html = String(BfImportMap({ base: '/components', externals, preload: false }))
    expect(html).not.toContain('modulepreload')
    // importmap still emitted
    expect(parseImportMap(html)['@barefootjs/client']).toBe('/components/barefoot.js')
  })

  test('escapes double quotes in preload hrefs', () => {
    const externals: ImportMapManifest = {
      preloads: ['/components/"onerror=alert(1).js'],
    }
    const html = String(BfImportMap({ base: '/components', externals }))
    expect(html).not.toContain('"onerror=alert(1)')
    expect(html).toContain('&quot;onerror=alert(1)')
  })
})
