/**
 * A declared prop holding a non-finite number reaches the template as that
 * number. The harness sends the caller's props to the runtime's seed
 * (`deriveStashFromDefaults`) as JSON, which has no `NaN` / `Infinity`:
 * `toPhpJson` writes them as `{"__bf_special": "NaN"}` (...) and the render
 * script's `bf_decode` turns them back into PHP's `NAN` / `INF` / `-INF`,
 * the way it does a fixture's `undefined`. Plain `JSON.stringify` wrote
 * `null`, so `String(n)` rendered "null" where the reference renders "NaN" /
 * "Infinity".
 */
import { test, expect } from 'bun:test'
import { BladeAdapter } from '../adapter'
import { renderBladeComponent, BladeNotAvailableError } from '../test-render'

const SOURCE = `
export function Num({ n }: { n?: number }) {
  return <p>{String(n)}</p>
}
`

for (const [label, n, text] of [
  ['NaN', Number.NaN, 'NaN'],
  ['Infinity', Number.POSITIVE_INFINITY, 'Infinity'],
  ['-Infinity', Number.NEGATIVE_INFINITY, '-Infinity'],
] as const) {
  test(`a declared ${label} prop renders as String(n) does (blade)`, async () => {
    let html: string
    try {
      html = await renderBladeComponent({ source: SOURCE, adapter: new BladeAdapter(), props: { n } })
    } catch (err) {
      if (err instanceof BladeNotAvailableError) {
        console.log(`Skipping: ${err.message}`)
        return
      }
      throw err
    }
    expect(html).toContain(`>${text}<`)
    expect(html).not.toContain('>null<')
    // bf-p is `JSON.stringify` of the props: a non-finite number is `null`.
    expect(html).toContain(`bf-p='{&#34;n&#34;:null}'`)
  })
}
