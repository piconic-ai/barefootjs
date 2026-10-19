import { createFixture } from '../src/types'

/**
 * A chained nullish read of the children prop whose inner fallback is
 * markup-looking text (`(props.children ?? '<b>fallback</b>') ?? ''`).
 * Present children stay markup; the absent case renders the inner fallback
 * as escaped text, not as HTML (#3539 review).
 */
export const fixture = createFixture({
  id: 'children-chained-nullish-fallback-escaped',
  description: 'A chained ?? over the children prop escapes its inner fallback text',
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
  return <div className="box">{(props.children ?? '<b>fallback</b>') ?? ''}</div>
}
`,
    './leaf.tsx': `
'use client'
export function Leaf() {
  return <span className="leaf">leaf</span>
}
`,
  },
  expectedHtml: `
    <main bf-s="test">
      <div bf-s="test_s1" class="box"><span bf-s="test_s0" class="leaf">leaf</span></div>
      <div bf-s="test_s2" class="box">&lt;b&gt;fallback&lt;/b&gt;</div>
    </main>
  `,
})
