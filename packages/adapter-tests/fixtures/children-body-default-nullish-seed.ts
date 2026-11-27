import { createFixture } from '../src/types'

/**
 * `children ?? 'missing'` over a body destructure of the props object with
 * a default (`const { children = 'dflt' } = props`), called without
 * children and with text children. The first renders the default and the
 * second the text.
 */
export const fixture = createFixture({
  id: 'children-body-default-nullish-seed',
  description: 'A defaulted body-destructured children binding seeding a signal through ?? renders the default or the children',
  source: `
import { Note } from './note'
export function Host() {
  return <div><Note /><Note>t</Note></div>
}
`,
  components: {
    './note.tsx': `
'use client'
import { createSignal } from '@barefootjs/client'
export function Note(props: { children?: unknown }) {
  const { children = 'dflt' } = props
  const [v] = createSignal(children ?? 'missing')
  return <q>{v()}</q>
}
`,
  },
  expectedHtml: `
    <div bf-s="test">
      <q bf-s="test_s0" bf="s1"><!--bf:s0-->dflt<!--/--></q>
      <q bf-s="test_s1" bf="s1"><!--bf:s0-->t<!--/--></q>
    </div>
  `,
})
