import { createFixture } from '../src/types'

export const fixture = createFixture({
  id: 'multiple-instances',
  description: 'Same component rendered multiple times with different props',
  source: `
import { Tag } from './tag'
export function TagList() {
  return <div><Tag label="Alpha" /><Tag label="Beta" /><Tag label="Gamma" /></div>
}
`,
  components: {
    './tag.tsx': `
export function Tag({ label }: { label: string }) {
  return <span>{label}</span>
}
`,
  },
  expectedHtml: `
    <div bf-s="test">
      <span bf-s="test_s0" bf="s1"><!--bf:s0-->Alpha<!--/--></span>
      <span bf-s="test_s1" bf="s1"><!--bf:s0-->Beta<!--/--></span>
      <span bf-s="test_s2" bf="s1"><!--bf:s0-->Gamma<!--/--></span>
    </div>
  `,
})
