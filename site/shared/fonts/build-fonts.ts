/**
 * Regenerate inter-regular.ts from inter-regular.ttf as a base64-encoded
 * Uint8Array module so it works under both Bun (dev) and workerd (production)
 * without bundler-specific binary import rules.
 *
 * Run: bun run site/shared/fonts/build-fonts.ts
 */

const TTF_PATH = new URL('./inter-regular.ttf', import.meta.url).pathname
const TS_PATH = new URL('./inter-regular.ts', import.meta.url).pathname

const ttf = await Bun.file(TTF_PATH).arrayBuffer()
const b64 = Buffer.from(ttf).toString('base64')

const ts = `/**
 * Inter Regular (Latin subset) — generated from inter-regular.ttf.
 * Regenerate via: bun run site/shared/fonts/build-fonts.ts
 */
const BASE64 = '${b64}'
export const interFont = Uint8Array.from(atob(BASE64), c => c.charCodeAt(0))
`

await Bun.write(TS_PATH, ts)
console.log(`Generated ${TS_PATH} (${(ts.length / 1024).toFixed(1)}KB from ${(ttf.byteLength / 1024).toFixed(1)}KB TTF)`)
