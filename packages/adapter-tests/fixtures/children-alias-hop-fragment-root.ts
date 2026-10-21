import { createFixture } from '../src/types'

/**
 * Fragment-rooted children through a const alias hop (`const c = children`):
 * a loop row's child wrapping it in an element, and a pass-through
 * `<>{c}</>` root, which is transparent like `<>{children}</>`. The row
 * children render as markup (#3572; the `alias-props` mutation of the
 * nightly sweep on `loop-row-fragment-root-child` and
 * `fragment-child-in-conditional`).
 */
export const fixture = createFixture({
  id: 'children-alias-hop-fragment-root',
  description: 'A const alias hop of the children prop under a fragment root keeps the children markup',
  source: `
'use client'
import { Tag, Pass } from './tag'
export function Page() {
  const opts = ['a', 'b']
  return (
    <div>
      {opts.map(opt => (
        <Tag key={opt}><b>{opt}</b></Tag>
      ))}
      <Pass><mark className="m">value</mark></Pass>
    </div>
  )
}
`,
  components: {
    './tag.tsx': `
'use client'
export function Tag({ children }: { children?: unknown }) {
  const c = children
  return (
    <>
      <span className="tag">{c}</span>
    </>
  )
}
export function Pass({ children }: { children?: unknown }) {
  const c = children
  return <>{c}</>
}
`,
  },
  expectedHtml: `
    <div bf-s="test" bf="s3">
      <span class="tag" data-key="a"><b><!--bf:^s0-->a<!--/--></b></span>
      <span class="tag" data-key="b"><b><!--bf:^s0-->b<!--/--></b></span>
      <mark class="m">value</mark>
    </div>
  `,
})
