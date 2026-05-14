import { createFixture } from '../src/types'

export const fixture = createFixture({
  id: 'class-vs-classname',
  description: 'className prop converts to class attribute',
  source: `
export function ClassVsClassname() {
  return <div className="container"><span className="label">Text</span></div>
}
`,
  expectedHtml: `
    <div class="container" bf-s="test"><span class="label">Text</span></div>
  `,
})
