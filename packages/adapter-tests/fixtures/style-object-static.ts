import { createFixture } from '../src/types'

export const fixture = createFixture({
  id: 'style-object-static',
  description: 'Inline style object with static string values converts to CSS string',
  source: `
export function StyleObjectStatic() {
  return <div style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)' }}>Hello</div>
}
`,
  expectedHtml: `
    <div style="background:var(--bg-surface);color:var(--text-primary)" bf-s="test">Hello</div>
  `,
})
