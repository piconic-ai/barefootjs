import { createFixture } from '../src/types'

/**
 * A component that seeds a signal with `props.children ?? 'missing'` and
 * renders it, called once without children and once with markup children.
 * The first renders the fallback text and the second the markup (#3987).
 */
export const fixture = createFixture({
  id: 'children-markup-nullish-seed',
  description: 'Markup children seeding a signal through ?? render as markup',
  source: `
import { Note } from './note'
export function Host() {
  return <div><Note /><Note><i>e</i></Note></div>
}
`,
  components: {
    './note.tsx': `
'use client'
import { createSignal } from '@barefootjs/client'
export function Note(props: { children?: unknown }) {
  const [v] = createSignal(props.children ?? 'missing')
  return <b>{v()}</b>
}
`,
  },
  expectedHtml: `
    <div bf-s="test">
      <b bf-s="test_s0" bf="s1"><!--bf:s0-->missing<!--/--></b>
      <b bf-s="test_s1" bf="s1"><!--bf:s0--><i>e</i><!--/--></b>
    </div>
  `,
})
