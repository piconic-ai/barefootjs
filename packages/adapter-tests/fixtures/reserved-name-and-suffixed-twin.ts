import { createFixture } from '../src/types'

/**
 * Sibling of `map-param-named-loop` (#3404): props named `loop` and `loop_`
 * stay distinct. Adapters that mangle a reserved word with a trailing `_`
 * also mangle the already-suffixed twin, so the two never collide.
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
