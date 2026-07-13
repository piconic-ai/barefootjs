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
  // Float-formatting parity: zero-pad (0 → "0.00", 7 → "7.00"), and
  // rounding where the decimal spelling is not exactly representable
  // (19.995 is stored as 19.99499… so JS toFixed(2) says "19.99" — a
  // formatter that rounds the decimal spelling would say "20.00").
  dataPoints: [
    { name: 'zero', props: { price: 0 } },
    { name: 'integer', props: { price: 7 } },
    { name: 'repr-boundary', props: { price: 19.995 } },
    { name: 'large', props: { price: 1234567.891 } },
  ],
  expectedHtml: `
    <div bf-s="test" bf="s1">¥<!--bf:s0-->19.50<!--/--></div>
  `,
})
