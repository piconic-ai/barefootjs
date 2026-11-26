import { createFixture } from '../src/types'

/**
 * Component-scope consts reading parameter-destructured props with defaults,
 * inlined into the client template: a scalar const, an object const (with a
 * shorthand entry), a const of an array const, a renamed binding
 * (`{ bb: r = ['q'] }`), a default reading an earlier binding (`{ a = 'A',
 * c = a }`), in text, attribute and condition positions. An omitted prop
 * reads its default in every one, exactly as a direct read does; an explicit
 * `null` keeps `null`.
 */
export const fixture = createFixture({
  id: 'destructure-default-param-inlined-const-positions',
  description: 'Inlined consts reading parameter-destructured props with defaults apply the defaults in text, attribute and condition positions',
  source: `
'use client'
export function DestructureDefaultParamInlinedConstPositions({ b = ['y'], s = 'd', bb: r = ['q'], a = 'A', c = a }: { b?: string[]; s?: string | null; bb?: string[]; a?: string; c?: string }) {
  const n = b.length
  const o = { n: b.length, s }
  const local = [b.length, 'z']
  const second = local.length + 1
  const renamed = [r.length, r[0]]
  const earlier = [c, 'e']
  return <p title={o.s} data-n={second}>{n}|{o.n}|{o.s}|{renamed[0]}|{renamed[1]}|{earlier[0]}|{local.length > 1 ? 'two' : 'one'}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s7" data-n="3" title="d"><!--bf:s0-->1<!--/-->|<!--bf:s1-->1<!--/-->|<!--bf:s2-->d<!--/-->|<!--bf:s3-->1<!--/-->|<!--bf:s4-->q<!--/-->|<!--bf:s5-->A<!--/-->|<!--bf-cond-start:s6-->two<!--bf-cond-end:s6--></p>
  `,
  dataPoints: [
    { name: 'all-present', props: { b: ['p', 'q', 'r'], s: 'S', bb: ['m', 'n'], a: 'X', c: 'C' } },
    { name: 's-null-a-only', props: { s: null, a: 'X' } },
  ],
})
