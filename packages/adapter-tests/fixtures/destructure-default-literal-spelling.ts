import { createFixture } from '../src/types'

/**
 * Destructure defaults spelled as an exponent (`1e3`), a hex literal
 * (`0x10`), a leading-dot fraction (`.5`) and a string with an escape
 * (`'xA'`). The default is the literal's value (1000, 16, 0.5, `xA`),
 * applied to an absent prop only, so an explicit `0` / `''` stays the
 * caller's value: in text, in an attribute and under arithmetic. An engine
 * that reads the default's source spelling instead of its value drops or
 * misspells it.
 */
export const fixture = createFixture({
  id: 'destructure-default-literal-spelling',
  description: "Exponent, hex, leading-dot and escaped-string destructure defaults apply their value when absent and keep an explicit 0 / ''",
  source: `
export function DestructureDefaultLiteralSpelling({ n = 1e3, h = 0x10, f = .5, s = 'x\\u0041' }: { n?: number; h?: number; f?: number; s?: string }) {
  return (
    <p data-n={n} data-s={s}>
      <span>{n}</span>
      <span>{h + 1}</span>
      <span>{f * 3}</span>
      <span>{s}</span>
    </p>
  )
}
`,
  props: { n: 0, h: 0, f: 0, s: '' },
  expectedHtml: `
    <p bf-s="test" bf="s8" data-n="0" data-s="">
      <span bf="s1"><!--bf:s0-->0<!--/--></span>
      <span bf="s3"><!--bf:s2-->1<!--/--></span>
      <span bf="s5"><!--bf:s4-->0<!--/--></span>
      <span bf="s7"><!--bf:s6--><!--/--></span>
    </p>
  `,
  dataPoints: [
    { name: 'all-absent', props: {} },
  ],
})
