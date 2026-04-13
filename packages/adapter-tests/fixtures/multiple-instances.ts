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
    Internal Server Error
  `,
})
