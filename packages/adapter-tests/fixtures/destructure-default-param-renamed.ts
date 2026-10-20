import { createFixture } from '../src/types'

/**
 * A renamed parameter destructure whose default reads an earlier binding
 * (`{ a = 'x', b: local = a }`): `local` takes `a` when `b` is omitted, and
 * the caller's `b` otherwise.
 */
export const fixture = createFixture({
  id: 'destructure-default-param-renamed',
  description: 'A renamed parameter destructure default reading an earlier binding takes it when the prop is omitted',
  source: `
export function DestructureDefaultParamRenamed({ a = 'x', b: local = a }: { a?: string; b?: string }) {
  return <p>{local}</p>
}
`,
  props: { a: 'y' },
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->y<!--/--></p>
  `,
  dataPoints: [
    { name: 'both-absent', props: {} },
    { name: 'b-present', props: { a: 'y', b: 'z' } },
  ],
})
