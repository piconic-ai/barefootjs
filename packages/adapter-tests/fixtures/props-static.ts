import { createFixture } from '../src/types'

export const fixture = createFixture({
  id: 'props-static',
  description: 'Stateless component with destructured props',
  source: `
export function PropsStatic({ label, count }: { label: string; count: number }) {
  return <div><span>{label}</span><span>{count}</span></div>
}
`,
  props: { label: 'Items', count: 10 },
  expectedHtml: `
    Internal Server Error
  `,
})
