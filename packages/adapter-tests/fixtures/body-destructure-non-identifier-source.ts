import { createFixture } from '../src/types'

/**
 * A component-body destructure whose source is not a plain name: a member
 * of the props object (`props.nested`) and a call (`readConf()`). JS binds
 * the names to the source's keys; the statements are refused (BF101)
 * instead of dropping them.
 */
export const fixture = createFixture({
  id: 'body-destructure-non-identifier-source',
  description: 'A body destructure of a member read or a call is refused',
  source: `
function readConf() { return { b: 'B' } }
export function DestructureNested(props: { nested: { a: string } }) {
  const { a } = props.nested
  const { b } = readConf()
  return <p>{a}:{b}</p>
}
`,
  props: { nested: { a: 'A' } },
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->A<!--/-->:B</p>
  `,
})
