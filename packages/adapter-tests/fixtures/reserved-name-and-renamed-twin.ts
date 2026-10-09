import { createFixture } from '../src/types'

/**
 * Escape twin of `reserved-name-and-internal-twin` (#3404): the second prop
 * is renamed from `__bf_loop` to `other`, so the adapters that refuse the
 * collision with BF105 render both values.
 */
export const fixture = createFixture({
  id: 'reserved-name-and-renamed-twin',
  description: 'Props named loop and other render their own values',
  source: `
export function ReservedNameAndRenamedTwin(props: { loop: string; other: string }) {
  return <div>{props.loop}:{props.other}</div>
}
`,
  props: { loop: 'first', other: 'second' },
  expectedHtml: `
    <div bf-s="test" bf="s2"><!--bf:s0-->first<!--/-->:<!--bf:s1-->second<!--/--></div>
  `,
})
