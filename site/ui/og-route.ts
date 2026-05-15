import { Hono } from 'hono'
import { Resvg } from '@cf-wasm/resvg'
import { buildOgSvg } from '@barefootjs/site-shared/lib/og-image'
import { interFont } from '@barefootjs/site-shared/fonts/inter-regular'

export function createOgRoute(): Hono {
  const app = new Hono()
  app.get('/', (c) => {
    const raw = c.req.query('title') ?? 'BarefootJS Components'
    const title = raw.length > 40 ? raw.slice(0, 40) + '…' : raw
    const svg = buildOgSvg(title)
    const pngData = new Resvg(svg, {
      font: {
        fontBuffers: [interFont],
        loadSystemFonts: false,
        defaultFontFamily: 'Inter',
      },
    }).render().asPng()
    const png = new Uint8Array(pngData.buffer as ArrayBuffer)
    return c.body(png, 200, {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400, immutable',
    })
  })
  return app
}
