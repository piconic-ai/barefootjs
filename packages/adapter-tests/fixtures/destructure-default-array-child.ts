import { createFixture } from '../src/types'

/**
 * An array prop whose destructure default reads an earlier array prop
 * (`{ a, b = a }`), forwarded to a child's typed array prop: a passed `b`
 * reaches the child as passed, and an omitted `b` reaches it as `a`.
 */
export const fixture = createFixture({
  id: 'destructure-default-array-child',
  description: 'An array prop defaulted to an earlier array prop reaches a child as passed, or as the earlier prop when omitted',
  source: `
import { Child } from './child'
export function DestructureDefaultArrayChild({ a, b = a }: { a: string[]; b?: string[] }) {
  return <div><Child rows={b} /></div>
}
`,
  components: {
    './child.tsx': `
export function Child({ rows }: { rows: string[] }) {
  return <p>{rows.length}</p>
}
`,
  },
  props: { a: ['first'], b: ['explicit', 'second'] },
  expectedHtml: `
    <div bf-s="test"><p bf-s="test_s0" bf="s1"><!--bf:s0-->2<!--/--></p></div>
  `,
  dataPoints: [
    { name: 'b-absent', props: { a: ['first'] } },
  ],
})
