import { createFixture } from '../src/types'

/**
 * `children ?? '<b>fallback</b>'` through two more bindings of the children
 * prop: a destructured param and a body alias of the props object. Present
 * children render as markup; the absent case renders the fallback as escaped
 * text (#3554). A renamed destructured param (`{ children: kids }`) is
 * `children-renamed-param`.
 */
export const fixture = createFixture({
  id: 'children-nullish-text-fallback-shapes',
  description: 'A ?? over a destructured or aliased children prop keeps present children markup',
  source: `
'use client'
import { Plain, Aliased } from './box'
import { Leaf } from './leaf'
export function Page() {
  return (
    <main>
      <Plain><Leaf /></Plain>
      <Plain />
      <Aliased><Leaf /></Aliased>
      <Aliased />
    </main>
  )
}
`,
  components: {
    './box.tsx': `
'use client'
export function Plain({ children }: { children?: unknown }) {
  return <div className="plain">{children ?? '<b>plain</b>'}</div>
}
export function Aliased(props: { children?: unknown }) {
  const { children: kids } = props
  return <div className="aliased">{kids ?? '<b>aliased</b>'}</div>
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
      <div bf-s="test_s1" class="plain"><span bf-s="test_s0" class="leaf">leaf</span></div>
      <div bf-s="test_s2" class="plain">&lt;b&gt;plain&lt;/b&gt;</div>
      <div bf-s="test_s4" class="aliased"><span bf-s="test_s3" class="leaf">leaf</span></div>
      <div bf-s="test_s5" class="aliased">&lt;b&gt;aliased&lt;/b&gt;</div>
    </main>
  `,
})
