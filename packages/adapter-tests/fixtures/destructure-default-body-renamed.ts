import { createFixture } from '../src/types'

/**
 * A renamed body destructure whose default reads an earlier binding
 * (`const { a = 'x', b: local = a } = props`), beside a raw `props.b` read
 * of the same prop: `local` takes `a` when `b` is omitted, while the raw read
 * still sees only what the caller passed.
 */
export const fixture = createFixture({
  id: 'destructure-default-body-renamed',
  description: 'A renamed body destructure default reading an earlier binding leaves a raw read of the same prop untouched',
  source: `
export function DestructureDefaultBodyRenamed(props: { a?: string; b?: string }) {
  const { a = 'x', b: local = a } = props
  return <p>{local}|{props.b ?? 'raw-missing'}</p>
}
`,
  props: { a: 'y' },
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf:s0-->y<!--/-->|<!--bf:s1-->raw-missing<!--/--></p>
  `,
  dataPoints: [
    { name: 'both-absent', props: {} },
    { name: 'b-present', props: { a: 'y', b: 'z' } },
    { name: 'a-absent-b-present', props: { b: 'z' } },
  ],
})
