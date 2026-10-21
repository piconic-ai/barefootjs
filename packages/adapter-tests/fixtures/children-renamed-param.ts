import { createFixture } from '../src/types'

/**
 * The children prop destructured under another name in the parameter list
 * (`{ children: kids }`), read bare and under a `??` text fallback, with
 * children passed and absent. Present children render as markup; the absent
 * case renders nothing and the escaped fallback (#3554).
 */
export const fixture = createFixture({
  id: 'children-renamed-param',
  description: 'A children prop renamed in the parameter destructure renders present children as markup',
  source: `
'use client'
import { Renamed } from './renamed'
import { Leaf } from './leaf'
export function Page() {
  return <main><Renamed><Leaf /></Renamed><Renamed /></main>
}
`,
  components: {
    './renamed.tsx': `
'use client'
export function Renamed({ children: kids }: { children?: unknown }) {
  return <div className="renamed"><p>{kids}</p><p>{kids ?? '<b>fallback</b>'}</p></div>
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
      <div bf-s="test_s1" class="renamed">
        <p><span bf-s="test_s0" class="leaf">leaf</span></p>
        <p><span bf-s="test_s0" class="leaf">leaf</span></p>
      </div>
      <div bf-s="test_s2" class="renamed">
        <p></p>
        <p>&lt;b&gt;fallback&lt;/b&gt;</p>
      </div>
    </main>
  `,
})
