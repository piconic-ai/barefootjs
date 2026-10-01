import { createFixture } from '../src/types'

export const fixture = createFixture({
  id: 'children-nullish-fallback',
  description: 'Children with an empty nullish fallback preserve component markup and absent children',
  source: `
'use client'
import { Box } from './box'
import { Leaf } from './leaf'
export function Page() {
  return <main><Box><Leaf /></Box><Box /></main>
}
`,
  components: {
    './box.tsx': `
'use client'
export function Box(props: { children?: unknown }) {
  return <div className="box">{props.children ?? ''}</div>
}
`,
    './leaf.tsx': `
'use client'
export function Leaf() {
  return <span className="leaf">leaf &amp; text</span>
}
`,
  },
  expectedHtml: `
    <main bf-s="test">
      <div bf-s="test_s1" class="box"><span bf-s="test_s0" class="leaf">leaf &amp; text</span></div>
      <div bf-s="test_s2" class="box"></div>
    </main>
  `,
})
