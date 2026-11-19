import { createFixture } from '../src/types'

/**
 * A literal attribute before an open spread keeps its own rendering when the
 * bag lacks the key, and the bag decides when it carries it. A boolean
 * attribute is present or absent whatever its text (`disabled=""`,
 * `hidden="false"`), so an empty spread must not drop it; a non-boolean empty
 * literal (`title=""`, `value=""`, `class=""`, `alt=""`, `aria-*` and `data-*`)
 * stays as written. `Probe` is rendered with an empty bag, a bag carrying the
 * boolean keys as `false`, `''` and `true`, and a bag with string values.
 */
export const fixture = createFixture({
  id: 'literal-boolean-attr-before-spread',
  description: 'a literal attribute before an open spread keeps its presence and text when the bag lacks the key',
  source: `
'use client'
import { Probe } from './probe'
export function LiteralBooleanAttrBeforeSpread() {
  return (
    <div>
      <Probe />
      <Probe disabled={false} hidden={false} readonly={false} title="t" value="v" aria-label="a" data-y="d" />
      <Probe disabled="" hidden="" readonly="" />
      <Probe disabled hidden readonly />
    </div>
  )
}
`,
  components: {
    './probe.tsx': `
export function Probe({ ...rest }: { [key: string]: unknown }) {
  return (
    <section>
      <input type="text" disabled="" hidden="false" readonly="readonly" title="" value="" className="" alt="" aria-label="" aria-hidden="false" data-x="" data-y="false" {...rest} />
      <button disabled hidden {...rest}>b</button>
    </section>
  )
}
`,
  },
  expectedHtml: `
    <div bf-s="test">
      <section bf-s="test_s0">
        <input alt="" aria-hidden="false" aria-label="" bf="s0" class="" data-x="" data-y="false" disabled hidden="false" readonly="readonly" title="" type="text" value="">
        <button bf="s1" disabled hidden>b</button>
      </section>
      <section bf-s="test_s1">
        <input alt="" aria-hidden="false" aria-label="a" bf="s0" class="" data-x="" data-y="d" title="t" type="text" value="v">
        <button aria-label="a" bf="s1" data-y="d" title="t" value="v">b</button>
      </section>
      <section bf-s="test_s2">
        <input alt="" aria-hidden="false" aria-label="" bf="s0" class="" data-x="" data-y="false" disabled hidden readonly title="" type="text" value="">
        <button bf="s1" disabled hidden readonly>b</button>
      </section>
      <section bf-s="test_s3">
        <input alt="" aria-hidden="false" aria-label="" bf="s0" class="" data-x="" data-y="false" disabled hidden readonly title="" type="text" value="">
        <button bf="s1" disabled hidden readonly>b</button>
      </section>
    </div>
  `,
})
