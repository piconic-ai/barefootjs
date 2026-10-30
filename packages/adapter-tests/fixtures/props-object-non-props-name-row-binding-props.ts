import { createFixture } from '../src/types'

/**
 * Sibling of `props-object-non-props-name`: in a component whose props
 * object is named `p`, a loop row binding named `props` is an ordinary row
 * value, so `props.value` takes the row's declared type, not a component
 * prop's. A number row field added to `1` stays numeric although the
 * component has a string prop `value`.
 */
export const fixture = createFixture({
  id: 'props-object-non-props-name-row-binding-props',
  description: 'A loop row binding named props keeps its own field types in a component whose props object is named p',
  source: `
export function PropsObjectNonPropsNameRowBindingProps(p: { value: string; rows: { id: string; value: number }[] }) {
  return (
    <div>
      <ul>{p.rows.map((props) => <li key={props.id}>{props.value + 1}</li>)}</ul>
      <s>{p.value}</s>
    </div>
  )
}
`,
  props: { value: 'v', rows: [{ id: 'a', value: 2 }, { id: 'b', value: 5 }] },
  expectedHtml: `
    <div bf-s="test">
      <ul bf="s2">
        <li bf="s1" data-key="a"><!--bf:s0-->3<!--/--></li>
        <li bf="s1" data-key="b"><!--bf:s0-->6<!--/--></li>
      </ul>
      <s bf="s4"><!--bf:s3-->v<!--/--></s>
    </div>
  `,
})
