import { createFixture } from '../src/types'

/**
 * A component-body destructure with a rest element whose source is a
 * const object, not the props object. JS binds `more` to the object's
 * other keys; the compiler has no form for building that object, so the
 * statement is refused (BF101) instead of dropping `more`.
 */
export const fixture = createFixture({
  id: 'body-destructure-rest-non-props-source',
  description: 'A body destructure with a rest element from a const object is refused',
  source: `
const conf = { a: 'A', b: 'B', c: 'C' }
export function DestructureRestConf(props: { label: string }) {
  const { a, ...more } = conf
  return <p>{props.label}:{a}:{more.b}</p>
}
`,
  props: { label: 'L' },
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->L<!--/-->:A:B</p>
  `,
})
