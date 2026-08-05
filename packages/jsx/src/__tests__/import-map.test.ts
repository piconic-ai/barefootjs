/**
 * renderImportMapHtml tests
 *
 * The shared importmap-snippet renderer turns a parsed externals manifest
 * into the `<script type="importmap">` (+ `<link rel="modulepreload">`) HTML
 * that template-string adapters render as a static snippet (issue #1644).
 * This is the single source of truth for that snippet.
 */
import { describe, test, expect } from 'bun:test'
import { renderImportMapHtml } from '../import-map'

function parseImportMap(html: string): Record<string, string> {
  const match = html.match(/<script type="importmap">(.*?)<\/script>/s)
  if (!match) throw new Error(`no importmap in: ${html}`)
  // Decode the < escape the renderer applies before parsing.
  return JSON.parse(match[1]).imports
}

describe('renderImportMapHtml', () => {
  test('emits the manifest importmap imports verbatim', () => {
    const html = renderImportMapHtml({
      importmap: {
        imports: {
          '@barefootjs/client': '/components/barefoot.js',
          '@barefootjs/client/runtime': '/components/barefoot.js',
          zod: 'https://esm.sh/zod@4.4.3',
        },
      },
      preloads: [],
    })
    expect(parseImportMap(html)).toEqual({
      '@barefootjs/client': '/components/barefoot.js',
      '@barefootjs/client/runtime': '/components/barefoot.js',
      zod: 'https://esm.sh/zod@4.4.3',
    })
    expect(html).not.toContain('modulepreload')
  })

  test('emits modulepreload links with crossorigin for manifest preloads (#1648)', () => {
    const html = renderImportMapHtml({
      importmap: { imports: {} },
      preloads: ['/components/form.js', 'https://esm.sh/zod@4.4.3'],
    })
    expect(html).toContain('<link rel="modulepreload" href="/components/form.js" crossorigin>')
    expect(html).toContain('<link rel="modulepreload" href="https://esm.sh/zod@4.4.3" crossorigin>')
  })

  test('reads defensively from a partial manifest', () => {
    expect(parseImportMap(renderImportMapHtml({}))).toEqual({})
    expect(renderImportMapHtml({})).not.toContain('modulepreload')
  })

  test('ends with a trailing newline (template-include friendly)', () => {
    expect(renderImportMapHtml({ importmap: { imports: {} } }).endsWith('\n')).toBe(true)
  })

  test('escapes < in the importmap JSON so a URL cannot break out of the script', () => {
    const html = renderImportMapHtml({
      importmap: { imports: { evil: 'https://x/</script><script>alert(1)</script>' } },
    })
    // The literal closing tag must not appear before the importmap's own.
    const importmapClose = html.indexOf('</script>')
    expect(html.slice(0, importmapClose)).not.toContain('</script>')
    // But the value still round-trips through JSON.parse.
    expect(parseImportMap(html).evil).toBe('https://x/</script><script>alert(1)</script>')
  })

  test('escapes double quotes and angle brackets in preload hrefs', () => {
    const html = renderImportMapHtml({
      preloads: ['/components/"onerror=alert(1).js'],
    })
    expect(html).not.toContain('"onerror=alert(1)')
    expect(html).toContain('&quot;onerror=alert(1)')
  })
})
