import { createFixture } from '../src/types'

/**
 * A destructure default (`{ v = 'D' }`) applies to an absent or
 * `undefined` prop only; an explicit `null` keeps `null`
 * (`spec/js-undefined-value.md` §1, decision 6). Hono renders a child
 * `<D v={x} />` as `D` for `undefined` and empty for `null`. Sources: the
 * component's own destructured props given an explicit `null` and omitted,
 * and a child receiving each of them forwarded, a literal `null`, a literal
 * `undefined` and an omitted prop at the call. Text and attribute
 * positions.
 */
export const fixture = createFixture({
  id: 'undef-null-destructure-default',
  description: 'A destructure default applies to an omitted or undefined prop, not to an explicit null',
  source: `
import { D } from './d'
export function UndefNullDestructureDefault({ n = 'N', u = 'U' }: { n?: string | null; u?: string | null }) {
  return (
    <div data-n={n} data-u={u}>
      <p>{n}|{u}</p>
      <D v={n} />
      <D v={u} />
      <D v={null} />
      <D v={undefined} />
      <D />
    </div>
  )
}
`,
  components: {
    './d.tsx': `
export function D({ v = 'D' }: { v?: string | null }) {
  return <i data-v={v}>{v}</i>
}
`,
  },
  props: { n: null },
  expectedHtml: `
    <div bf-s="test" bf="s8" data-u="U">
      <p bf="s2"><!--bf:s0--><!--/-->|<!--bf:s1-->U<!--/--></p>
      <i bf-s="test_s3" bf="s1"><!--bf:s0--><!--/--></i>
      <i bf-s="test_s4" bf="s1" data-v="U"><!--bf:s0-->U<!--/--></i>
      <i bf-s="test_s5" bf="s1"><!--bf:s0--><!--/--></i>
      <i bf-s="test_s6" bf="s1" data-v="D"><!--bf:s0-->D<!--/--></i>
      <i bf-s="test_s7" bf="s1" data-v="D"><!--bf:s0-->D<!--/--></i>
    </div>
  `,
})
