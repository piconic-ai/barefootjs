import { createFixture } from '../src/types'

export const fixture = createFixture({
  id: 'child-component',
  description: 'Parent renders a child component from a separate file',
  source: `
import { Badge } from './badge'
export function ParentCard({ title }: { title: string }) {
  return <div><h2>{title}</h2><Badge label="New" /></div>
}
`,
  components: {
    './badge.tsx': `
export function Badge({ label }: { label: string }) {
  return <span>{label}</span>
}
`,
  },
  props: { title: 'Hello' },
  expectedHtml: `
    <div bf-s="test">
      <h2 bf="s1"><!--bf:s0-->Hello<!--/--></h2>
      <span bf-s="test_s2" bf="s1"><!--bf:s0-->New<!--/--></span>
    </div>
  `,
})
