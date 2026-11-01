import { createFixture } from '../src/types'

/**
 * A read through a props-object body rest of a key the same destructure
 * takes (`const { label, ...rest } = props`, `rest.label`). The rest never
 * holds `label`, so JS reads `undefined`; the read is refused (BF101).
 */
export const fixture = createFixture({
  id: 'body-rest-taken-key-read',
  description: 'A read of a taken key through a props-object body rest is refused',
  source: `
export function BodyRestTaken(props: { label: string; id?: string }) {
  const { label, ...rest } = props
  return <p>{label}[{rest.label}]</p>
}
`,
  props: { label: 'L' },
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf:s0-->L<!--/-->[<!--bf:s1--><!--/-->]</p>
  `,
})
