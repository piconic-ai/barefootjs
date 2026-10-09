import { createFixture } from '../src/types'

/**
 * Sibling of `map-param-named-loop` (#3404): props named `loop` and `loop_`
 * stay distinct. Jinja, MiniJinja, Twig, Pebble and Blade rename `loop` to
 * `__bf_loop` rather than `loop_`, so the two never collide there.
 */
export const fixture = createFixture({
  id: 'reserved-name-and-suffixed-twin',
  description: 'Props named loop and loop_ render their own values',
  source: `
export function ReservedNameAndSuffixedTwin(props: { loop: string; loop_: string }) {
  return <div>{props.loop}:{props.loop_}</div>
}
`,
  props: { loop: 'first', loop_: 'second' },
  expectedHtml: `
    <div bf-s="test" bf="s2"><!--bf:s0-->first<!--/-->:<!--bf:s1-->second<!--/--></div>
  `,
})
