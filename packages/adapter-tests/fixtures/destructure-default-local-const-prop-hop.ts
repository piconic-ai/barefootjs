import { createFixture } from '../src/types'

/**
 * A body destructure default that reads a component-local const which
 * itself reads an earlier destructured prop (`const L = a + '!'`,
 * `{ b = L }`, #3725). `a` has a computed default of its own, so `b`'s
 * default has to be applied after `a`'s, and the props type lists `b`
 * before `a`.
 *
 * The client template reads `L` as `_p.a + '!'`, without `a`'s default
 * (limitation `const-alias-signature-default`), so the CSR render is pinned.
 */
export const fixture = createFixture({
  id: 'destructure-default-local-const-prop-hop',
  description: 'A default reading a local const that reads an earlier defaulted prop is applied after that prop',
  source: `
export function DestructureDefaultLocalConstPropHop(props: { c?: string; b?: string; a?: string }) {
  const { a = 'x'.toUpperCase() } = props
  const L = a + '!'
  const { b = L, c = L.toUpperCase() } = props
  return <p>{a}|{b}|{c}</p>
}
`,
  props: {},
  expectedHtml: `
    <p bf-s="test" bf="s3"><!--bf:s0-->X<!--/-->|<!--bf:s1-->X!<!--/-->|<!--bf:s2-->X!<!--/--></p>
  `,
  dataPoints: [
    { name: 'a-passed', props: { a: 'q' } },
    { name: 'b-passed', props: { b: 'p' } },
  ],
})
