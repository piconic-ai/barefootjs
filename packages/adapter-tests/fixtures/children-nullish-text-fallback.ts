import { createFixture } from '../src/types'

/**
 * A single-level nullish read of the children prop whose fallback is
 * markup-looking text (`props.children ?? '<b>fallback</b>'`). Present
 * children render as markup; the absent case renders the fallback as
 * escaped text (#3554).
 */
export const fixture = createFixture({
  id: 'children-nullish-text-fallback',
  description: 'A ?? over the children prop keeps present children markup and escapes its fallback text',
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
  return <div className="box">{props.children ?? '<b>fallback</b>'}</div>
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
