import { createFixture } from '../src/types'

/**
 * A `.map()` item param named `loop`, which Jinja, MiniJinja and Twig bind as
 * their own loop variable inside `{% for %}` (#3404). The index param still
 * reads the engine's loop counter.
 */
export const fixture = createFixture({
  id: 'map-param-named-loop',
  description: 'A map item param named loop renders like any other name',
  source: `
export function MapParamNamedLoop(props: { tags: string[] }) {
  return <ul>{props.tags.map((loop, i) => <li key={loop} data-i={i}>{loop}</li>)}</ul>
}
`,
  props: { tags: ['a', 'b'] },
  expectedHtml: `
    <ul bf-s="test" bf="s2">
      <li bf="s1" data-i="0" data-key="a"><!--bf:s0-->a<!--/--></li>
      <li bf="s1" data-i="1" data-key="b"><!--bf:s0-->b<!--/--></li>
    </ul>
  `,
})
