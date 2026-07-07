import { createFixture } from '../src/types'

/**
 * `Number.prototype.toFixed(digits)` in text position — the canonical
 * price-formatting shape. Rounds AND pads: 19.5 → "19.50".
 */
export const fixture = createFixture({
  id: 'number-tofixed',
  description: '.toFixed(2) formats a numeric prop with rounding and zero-padding',
  source: `
function NumberToFixed({ price }: { price: number }) {
  return <div>¥{price.toFixed(2)}</div>
}
export { NumberToFixed }
`,
  props: { price: 19.5 },
  expectedHtml: `
    <div bf-s="test" bf="s1">¥<!--bf:s0-->19.50<!--/--></div>
  `,
})
