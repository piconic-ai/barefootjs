import { createFixture } from '../src/types'

/**
 * A body const holding a fallback read of the children prop (`const label
 * = props.children ?? '<s>row</s>'`), read in a loop row whose parameter is
 * named `props`, the name the const's initializer reads. The initializer
 * reads the component's props where it is declared, so present children
 * render as markup and absent children render the fallback as escaped
 * text (limitation `children-fallback-const-shadowed-read`).
 */
export const fixture = createFixture({
  id: 'children-fallback-const-row-shadow',
  description: 'A children fallback const read in a row whose parameter shadows a name its initializer reads',
  source: `
import { Rows } from './note'
export function Host() {
  return <div><Rows><i>a</i></Rows><Rows /></div>
}
`,
  components: {
    './note.tsx': `
export function Rows(props: { children?: unknown }) {
  const label = props.children ?? '<s>row</s>'
  return <ul>{[1].map((props) => <li key={props}>{label}</li>)}</ul>
}
`,
  },
  expectedHtml: `
    <div bf-s="test">
      <ul bf-s="test_s0" bf="s0"><li data-key="1"><i>a</i></li></ul>
      <ul bf-s="test_s1" bf="s0"><li data-key="1">&lt;s&gt;row&lt;/s&gt;</li></ul>
    </div>
  `,
})
