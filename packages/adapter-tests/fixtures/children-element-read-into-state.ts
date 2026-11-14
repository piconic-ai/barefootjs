import { createFixture } from '../src/types'

/**
 * An element passed as JSX children to a component that reads
 * `props.children` into a signal and renders the signal. JSX renders the
 * element; a text slot that prints the signal's value as text does not
 * (limitation `children-element-read-into-state`). Covered for a plain
 * call and for one that spreads the props object, whose client init hands
 * the child the same markup (#3714).
 */
export const fixture = createFixture({
  id: 'children-element-read-into-state',
  description: 'An element child a component reads into state renders as that element',
  source: `
import { Note } from './note'
export function Host(props: { tone?: string }) {
  return <div><Note><i>a</i></Note><Note {...props}><i>b</i></Note></div>
}
`,
  components: {
    './note.tsx': `
'use client'
import { createSignal } from '@barefootjs/client'
export function Note(props: { children?: unknown; tone?: string }) {
  const [value, setValue] = createSignal(props.children)
  return <b data-tone={props.tone} onClick={() => setValue('clicked')}>{value()}</b>
}
`,
  },
  props: { tone: 'warm' },
  expectedHtml: `
    <div bf-s="test">
      <b bf-s="test_s0" bf="s1"><!--bf:s0--><i>a</i><!--/--></b>
      <b bf-s="test_s1" bf="s1" data-tone="warm"><!--bf:s0--><i>b</i><!--/--></b>
    </div>
  `,
})
