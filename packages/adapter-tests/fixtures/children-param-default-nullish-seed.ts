import { createFixture } from '../src/types'

/**
 * `children ?? 'missing'` over a destructured `children` parameter with a
 * default, called without children and with markup children. The first
 * renders the default and the second the markup.
 */
export const fixture = createFixture({
  id: 'children-param-default-nullish-seed',
  description: 'A defaulted children parameter seeding a signal through ?? renders the default or the markup',
  source: `
import { Note } from './note'
export function Host() {
  return <div><Note /><Note><i>p</i></Note></div>
}
`,
  components: {
    './note.tsx': `
'use client'
import { createSignal } from '@barefootjs/client'
export function Note({ children = 'dflt' }: { children?: unknown }) {
  const [v] = createSignal(children ?? 'missing')
  return <b>{v()}</b>
}
`,
  },
  expectedHtml: `
    <div bf-s="test">
      <b bf-s="test_s0" bf="s1"><!--bf:s0-->dflt<!--/--></b>
      <b bf-s="test_s1" bf="s1"><!--bf:s0--><i>p</i><!--/--></b>
    </div>
  `,
})
