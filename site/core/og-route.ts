import { Hono } from 'hono'
import { Resvg } from '@cf-wasm/resvg'
import { buildOgSvg } from '@barefootjs/site-shared/lib/og-image'
import { interBoldFont } from '@barefootjs/site-shared/fonts/inter-bold'
import { titleFromOgImageFile } from './lib/og-image'

/**
 * GET /og/<base64url(title)>.png — the OG image for a docs page (see
 * lib/og-image.ts). Served by this route in dev; the static build calls the
 * same route once per title and writes the PNGs to dist/og/.
 */
export function createOgRoute(): Hono {
  const app = new Hono()
  app.get('/:file', (c) => {
    const raw = titleFromOgImageFile(c.req.param('file'))
    if (raw === null) return c.notFound()
    const title = raw.length > 28 ? raw.slice(0, 28) + '…' : raw
    const svg = buildOgSvg(title)
    const pngData = new Resvg(svg, {
      font: {
        fontBuffers: [interBoldFont],
        loadSystemFonts: false,
        defaultFontFamily: 'Inter',
      },
    }).render().asPng()
    const png = new Uint8Array(pngData.buffer as ArrayBuffer)
    return c.body(png, 200, { 'Content-Type': 'image/png' })
  })
  return app
}
