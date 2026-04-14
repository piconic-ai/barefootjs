import { createFixture } from '../src/types'

export const fixture = createFixture({
  id: 'style-object-dynamic',
  description: 'Inline style object with dynamic prop value renders as CSS string',
  source: `
export function StyleObjectDynamic({ color }: { color: string }) {
  return <div style={{ backgroundColor: color, padding: '8px' }}>Hello</div>
}
`,
  props: { color: 'red' },
  expectedHtml: `
    <div style="background-color:red;padding:8px" bf-s="test" bf="s0">Hello</div>
  `,
})
