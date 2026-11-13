import { createFixture } from '../src/types'

/**
 * `{...props}` onto a child component inside a row that is itself named
 * `props` (#3727): the child receives the row's keys, not the component's
 * own props. The component's `label` (`ROOT`) is what a spread of the props
 * object would hand every row's child.
 */
export const fixture = createFixture({
  id: 'loop-param-named-props-spread-child',
  description: 'A row binding named props is spread onto a child component as the row, not the component props',
  source: `
import { Tag } from './tag'
type Row = { label: string; title: string }
export function LoopParamNamedPropsSpreadChild(props: { label: string; rows: Row[] }) {
  return (
    <div data-root={props.label}>
      <ul>{props.rows.map((props) => <Tag key={props.label} {...props} />)}</ul>
    </div>
  )
}
`,
  components: {
    './tag.tsx': `
export function Tag(props: { label: string; title?: string }) {
  return <b title={props.title}>{props.label}</b>
}
`,
  },
  props: { label: 'ROOT', rows: [{ label: 'a', title: 'ta' }, { label: 'b', title: 'tb' }] },
  expectedHtml: `
    <div bf-s="test" bf="s2" data-root="ROOT"><ul bf="s1"><b bf-s="Tag_*" bf="s1" data-key="a" title="ta"><!--bf:s0-->a<!--/--></b><b bf-s="Tag_*" bf="s1" data-key="b" title="tb"><!--bf:s0-->b<!--/--></b></ul></div>
  `,
})
