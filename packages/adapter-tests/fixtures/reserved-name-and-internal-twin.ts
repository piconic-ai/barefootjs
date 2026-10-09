import { createFixture } from '../src/types'

/**
 * Sibling of `reserved-name-and-suffixed-twin` (#3404): props named `loop`
 * and `__bf_loop`. Jinja, MiniJinja, Twig, Pebble and Blade rename `loop` to
 * `__bf_loop`, so the two would read one value there. Those adapters refuse
 * with BF105 instead of rendering `second:second`.
 */
export const fixture = createFixture({
  id: 'reserved-name-and-internal-twin',
  description: 'Props named loop and __bf_loop render their own values, or the adapter refuses',
  source: `
export function ReservedNameAndInternalTwin(props: { loop: string; __bf_loop: string }) {
  return <div>{props.loop}:{props.__bf_loop}</div>
}
`,
  props: { loop: 'first', __bf_loop: 'second' },
  expectedHtml: `
    <div bf-s="test" bf="s2"><!--bf:s0-->first<!--/-->:<!--bf:s1-->second<!--/--></div>
  `,
  escapes: [{ kind: 'rewrite', fixture: 'reserved-name-and-renamed-twin' }],
})
