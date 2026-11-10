import { createFixture } from '../src/types'

/**
 * The body-destructure twin of `destructure-default-array-literal`:
 * `function C(props)` with `const { h = ['p'] } = props`. An absent prop
 * takes the literal, an explicit `[]` keeps the empty array, and a given
 * array wins, read through `.length`, `.join('|')` and an attribute. A
 * `.map()` over the body-destructured `h` is a loud refusal on the template
 * adapters (`computed-const-loop-source`), so it is not read here.
 */
export const fixture = createFixture({
  id: 'destructure-default-array-literal-body',
  description: 'A body destructure default that is a non-empty array literal applies to an absent prop only',
  source: `
export function DestructureDefaultArrayLiteralBody(props: { h?: string[] }) {
  const { h = ['p'] } = props
  return (
    <div data-h={h.join(',')}>
      <p>{h.length}|{h.join('|')}</p>
    </div>
  )
}
`,
  props: {},
  expectedHtml: `
    <div bf-s="test" bf="s3" data-h="p"><p bf="s2"><!--bf:s0-->1<!--/-->|<!--bf:s1-->p<!--/--></p></div>
  `,
  dataPoints: [
    { name: 'empty', props: { h: [] } },
    { name: 'given', props: { h: ['a', 'b'] } },
  ],
})
