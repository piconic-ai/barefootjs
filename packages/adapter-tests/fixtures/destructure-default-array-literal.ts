import { createFixture } from '../src/types'

/**
 * A parameter destructure whose default is a non-empty array literal
 * (`{ h = ['p'] }`): an absent prop takes the literal, an explicit `[]`
 * keeps the empty array (the default applies to an absent prop only), and
 * a given array wins. The prop is read through `.length`, `.join('|')`, a
 * `.map()` rendering one row per element, and an attribute.
 */
export const fixture = createFixture({
  id: 'destructure-default-array-literal',
  description: 'A parameter destructure default that is a non-empty array literal applies to an absent prop only',
  source: `
export function DestructureDefaultArrayLiteral({ h = ['p'] }: { h?: string[] }) {
  return (
    <div data-h={h.join(',')}>
      <p>{h.length}|{h.join('|')}</p>
      <ul>{h.map((x) => <li key={x}>{x}</li>)}</ul>
    </div>
  )
}
`,
  props: {},
  expectedHtml: `
    <div bf-s="test" bf="s5" data-h="p">
      <p bf="s2"><!--bf:s0-->1<!--/-->|<!--bf:s1-->p<!--/--></p>
      <ul bf="s4"><li data-key="p"><!--bf:s3-->p<!--/--></li></ul>
    </div>
  `,
  dataPoints: [
    { name: 'empty', props: { h: [] } },
    { name: 'given', props: { h: ['a', 'b'] } },
  ],
})
