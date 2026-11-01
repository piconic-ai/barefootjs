import { createFixture } from '../src/types'

/**
 * A component-body destructure of a const object whose element defaults to
 * a non-literal (`{ a = props.fallback }`). JS reads the default when the
 * object lacks the key; the statement is refused (BF101) instead of
 * dropping `a`.
 */
export const fixture = createFixture({
  id: 'body-destructure-non-literal-default',
  description: 'A body destructure with a non-literal default is refused',
  source: `
const conf: { a?: string } = {}
export function DestructureDefaultProp(props: { fallback: string }) {
  const { a = props.fallback } = conf
  return <p>{a}</p>
}
`,
  props: { fallback: 'F' },
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->F<!--/--></p>
  `,
})
