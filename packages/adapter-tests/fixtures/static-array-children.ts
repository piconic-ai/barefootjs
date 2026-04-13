import { createFixture } from '../src/types'

export const fixture = createFixture({
  id: 'static-array-children',
  description: 'Static array with child components preserves className (#483)',
  source: `
import { ListItem } from './list-item'
export function StaticList() {
  const items = [{ label: 'Alpha' }, { label: 'Beta' }]
  return (
    <ul>
      {items.map(item => (
        <ListItem label={item.label} className="text-sm" />
      ))}
    </ul>
  )
}
`,
  components: {
    './list-item.tsx': `
export function ListItem({ label, className }: { label: string; className?: string }) {
  return <li className={className}>{label}</li>
}
`,
  },
  expectedHtml: `
    Internal Server Error
  `,
})
