import { createFixture } from '../src/types'

/**
 * A component that computes `props.children ?? 'missing'` in a memo and
 * renders it, called once without children and once with markup children.
 * The first renders the fallback text and the second the markup: the memo
 * twin of `children-markup-nullish-seed`.
 */
export const fixture = createFixture({
  id: 'children-markup-nullish-memo',
  description: 'Markup children read through a ?? memo render as markup',
  source: `
import { Note } from './note'
export function Host() {
  return <div><Note /><Note><i>m</i></Note></div>
}
`,
  components: {
    './note.tsx': `
'use client'
import { createMemo } from '@barefootjs/client'
export function Note(props: { children?: unknown }) {
  const v = createMemo(() => props.children ?? 'missing')
  return <b>{v()}</b>
}
`,
  },
  expectedHtml: `
    <div bf-s="test">
      <b bf-s="test_s0" bf="s1"><!--bf:s0-->missing<!--/--></b>
      <b bf-s="test_s1" bf="s1"><!--bf:s0--><i>m</i><!--/--></b>
    </div>
  `,
})
