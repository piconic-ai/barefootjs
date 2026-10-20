import { createFixture } from '../src/types'

/**
 * The children prop under another name, read under the fallbacks
 * `children-renamed-param` does not cover: `kids || '<b>x</b>'` and
 * `kids ?? ''` with the rename in the parameter destructure, and the bare
 * read and `||` with the rename in a body destructure
 * (`const { children: kids } = props`). Present children render as markup;
 * the absent case renders nothing or the escaped fallback (#3572).
 */
export const fixture = createFixture({
  id: 'children-renamed-param-fallback-shapes',
  description: 'A renamed children prop keeps present children markup under || and ?? fallbacks',
  source: `
'use client'
import { OrKids, EmptyKids, BodyKids } from './box'
import { Leaf } from './leaf'
export function Page() {
  return (
    <main>
      <OrKids><Leaf /></OrKids>
      <OrKids />
      <EmptyKids><Leaf /></EmptyKids>
      <EmptyKids />
      <BodyKids><Leaf /></BodyKids>
      <BodyKids />
    </main>
  )
}
`,
  components: {
    './box.tsx': `
'use client'
export function OrKids({ children: kids }: { children?: unknown }) {
  return <div className="or">{kids || '<b>or</b>'}</div>
}
export function EmptyKids({ children: kids }: { children?: unknown }) {
  return <div className="empty">{kids ?? ''}</div>
}
export function BodyKids(props: { children?: unknown }) {
  const { children: kids } = props
  return <div className="body"><p>{kids}</p><p>{kids || '<b>body</b>'}</p></div>
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
      <div bf-s="test_s1" class="or"><span bf-s="test_s0" class="leaf">leaf</span></div>
      <div bf-s="test_s2" class="or">&lt;b&gt;or&lt;/b&gt;</div>
      <div bf-s="test_s4" class="empty"><span bf-s="test_s3" class="leaf">leaf</span></div>
      <div bf-s="test_s5" class="empty"></div>
      <div bf-s="test_s7" class="body">
        <p><span bf-s="test_s6" class="leaf">leaf</span></p>
        <p><span bf-s="test_s6" class="leaf">leaf</span></p>
      </div>
      <div bf-s="test_s8" class="body">
        <p></p>
        <p>&lt;b&gt;body&lt;/b&gt;</p>
      </div>
    </main>
  `,
})
