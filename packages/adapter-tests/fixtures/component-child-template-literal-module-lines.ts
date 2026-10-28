import { createFixture } from '../src/types'

/**
 * Lines inside a child's multiline template literals that read like ES
 * module syntax (`import { X } from '…'`, a bare `import '…'`,
 * `export default …`, `export { … }`) are string content, not
 * declarations: every adapter renders them verbatim, in text, attribute
 * and child-prop positions, under both the destructured and the
 * `function C(props)` props forms.
 */
export const fixture = createFixture({
  id: 'component-child-template-literal-module-lines',
  description: 'Import/export-looking lines inside a child template literal render verbatim',
  source: `
import { Code } from './code'
import { Note } from './note'
export function ModuleLines() {
  return (
    <section>
      <Code label="a" />
      <Note title="b" />
    </section>
  )
}
`,
  components: {
    './code.tsx': `
export function Code({ label }: { label: string }) {
  const body = \`before
import { Tag } from './tag'
import './side-effect'
export default body
after\`
  return <pre data-src={\`x
export { Code }
y\`}>{label}:{body}</pre>
}
`,
    './note.tsx': `
import { Code } from './code'
export function Note(props: { title: string }) {
  return (
    <div title={props.title + \`
import Foo from 'foo'\`}>
      <Code label={\`n
export const z = 1
\`} />
    </div>
  )
}
`,
  },
  props: {},
  expectedHtml: `
    <section bf-s="test">
      <pre bf-s="test_s0" bf="s1" data-src="x export { Code } y"><!--bf:s0-->a<!--/-->:before import { Tag } from &#39;./tag&#39; import &#39;./side-effect&#39; export default body after</pre>
      <div bf-s="test_s1" bf="s1" title="b import Foo from &#39;foo&#39;"><pre bf-s="test_s1_s0" bf="s1" data-src="x export { Code } y"><!--bf:s0-->n export const z = 1 <!--/-->:before import { Tag } from &#39;./tag&#39; import &#39;./side-effect&#39; export default body after</pre></div>
    </section>
  `,
})
