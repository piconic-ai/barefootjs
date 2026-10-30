import { createFixture } from '../src/types'

/**
 * A quoted attribute is a string whatever it spells: `label="true"`,
 * `label="5"` and `label="-0"` hand the child the strings `"true"`, `"5"`
 * and `"-0"`, never a boolean or a number. A static child's typed props
 * (`string` here) take the string as written, in text, an attribute, a
 * ternary test, `&&`, a template literal and a concatenation, through
 * destructured props and `function C(props)`.
 */
export const fixture = createFixture({
  id: 'child-string-prop-literal-lookalike',
  description: 'Quoted literals that look like booleans or numbers, passed to a child string prop',
  source: `
import { Tag } from './Tag'
import { Note } from './Note'
export function ChildStringPropLiteralLookalike() {
  return (
    <div>
      <Tag label="true" />
      <Tag label="false" />
      <Tag label="5" />
      <Tag label="-0" />
      <Tag label="001" />
      <Tag label="1e3" />
      <Note text="0.50" />
      <Note text="false" />
    </div>
  )
}
`,
  components: {
    './Tag': `
export function Tag({ label }: { label: string }) {
  return (
    <span title={label} data-x={\`[\${label}]\`}>
      {label}|{label ? 'y' : 'n'}|{label && 'set'}|{label + '!'}
    </span>
  )
}
`,
    './Note': `
export function Note(props: { text: string }) {
  return <em data-n={props.text}>{props.text}|{props.text.length}</em>
}
`,
  },
  expectedHtml: `
    <div bf-s="test">
      <span bf-s="test_s0" bf="s4" data-x="[true]" title="true"><!--bf:s0-->true<!--/-->|<!--bf-cond-start:s1-->y<!--bf-cond-end:s1-->|<!--bf-cond-start:s2-->set<!--bf-cond-end:s2-->|<!--bf:s3-->true!<!--/--></span>
      <span bf-s="test_s1" bf="s4" data-x="[false]" title="false"><!--bf:s0-->false<!--/-->|<!--bf-cond-start:s1-->y<!--bf-cond-end:s1-->|<!--bf-cond-start:s2-->set<!--bf-cond-end:s2-->|<!--bf:s3-->false!<!--/--></span>
      <span bf-s="test_s2" bf="s4" data-x="[5]" title="5"><!--bf:s0-->5<!--/-->|<!--bf-cond-start:s1-->y<!--bf-cond-end:s1-->|<!--bf-cond-start:s2-->set<!--bf-cond-end:s2-->|<!--bf:s3-->5!<!--/--></span>
      <span bf-s="test_s3" bf="s4" data-x="[-0]" title="-0"><!--bf:s0-->-0<!--/-->|<!--bf-cond-start:s1-->y<!--bf-cond-end:s1-->|<!--bf-cond-start:s2-->set<!--bf-cond-end:s2-->|<!--bf:s3-->-0!<!--/--></span>
      <span bf-s="test_s4" bf="s4" data-x="[001]" title="001"><!--bf:s0-->001<!--/-->|<!--bf-cond-start:s1-->y<!--bf-cond-end:s1-->|<!--bf-cond-start:s2-->set<!--bf-cond-end:s2-->|<!--bf:s3-->001!<!--/--></span>
      <span bf-s="test_s5" bf="s4" data-x="[1e3]" title="1e3"><!--bf:s0-->1e3<!--/-->|<!--bf-cond-start:s1-->y<!--bf-cond-end:s1-->|<!--bf-cond-start:s2-->set<!--bf-cond-end:s2-->|<!--bf:s3-->1e3!<!--/--></span>
      <em bf-s="test_s6" bf="s2" data-n="0.50"><!--bf:s0-->0.50<!--/-->|<!--bf:s1-->4<!--/--></em>
      <em bf-s="test_s7" bf="s2" data-n="false"><!--bf:s0-->false<!--/-->|<!--bf:s1-->5<!--/--></em>
    </div>
  `,
})
