import { createFixture } from '../src/types'

/**
 * Component-scope consts reading parameter-destructured props with
 * primitive-literal defaults, inlined into the client template: a scalar
 * const, an object const (with a shorthand entry), a const of an array const,
 * a renamed binding (`{ k: r = 'q' }`), a negative number, a default reading
 * an earlier binding (`{ a = 'A', c = a }`, and grouped, `g = (a)`), grouped
 * and other literal spellings (`('d')`, `(-1)`, `` `d` ``, `1_000`), in text,
 * attribute and condition positions. An omitted prop reads its default in every one, exactly as a
 * direct read does; an explicit `null` keeps `null`.
 */
export const fixture = createFixture({
  id: 'destructure-default-param-inlined-const-positions',
  description: 'Inlined consts reading parameter-destructured props with defaults apply the defaults in text, attribute and condition positions',
  source: `
'use client'
export function DestructureDefaultParamInlinedConstPositions({ b = 'y', s = 'd', k: r = 'q', m = -1, a = 'A', c = a, g = (a), p = ('d'), q = (-1), t = \`d\`, u = 1_000 }: { b?: string; s?: string | null; k?: string; m?: number; a?: string; c?: string; g?: string; p?: string; q?: number; t?: string; u?: number }) {
  const n = b.length
  const o = { n: b.length, s }
  const local = [b.length, 'z']
  const second = local.length + m
  const renamed = [r.length, r]
  const earlier = [c, 'e']
  const spelled = [g, p, q, t, u]
  return <p title={o.s} data-n={second}>{n}|{o.n}|{o.s}|{renamed[0]}|{renamed[1]}|{earlier[0]}|{local[0] > 0 ? 'some' : 'none'}|{spelled[0]}|{spelled[1]}|{spelled[2]}|{spelled[3]}|{spelled[4]}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s12" data-n="1" title="d"><!--bf:s0-->1<!--/-->|<!--bf:s1-->1<!--/-->|<!--bf:s2-->d<!--/-->|<!--bf:s3-->1<!--/-->|<!--bf:s4-->q<!--/-->|<!--bf:s5-->A<!--/-->|<!--bf-cond-start:s6-->some<!--bf-cond-end:s6-->|<!--bf:s7-->A<!--/-->|<!--bf:s8-->d<!--/-->|<!--bf:s9-->-1<!--/-->|<!--bf:s10-->d<!--/-->|<!--bf:s11-->1000<!--/--></p>
  `,
  dataPoints: [
    { name: 'all-present', props: { b: 'pqr', s: 'S', k: 'mn', m: 2, a: 'X', c: 'C', g: 'G', p: 'P', q: 3, t: 'T', u: 4 } },
    { name: 's-null-a-only', props: { b: '', s: null, a: 'X' } },
  ],
})
