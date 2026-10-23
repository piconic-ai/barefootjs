import { createFixture } from '../src/types'

/**
 * A `.map()` row whose parameter is named `props`, reading a member of it
 * (`props.label`) in a component with destructured props. The row's
 * `props` is the row item, not the component's props object, so each row
 * renders its own item's label.
 */
export const fixture = createFixture({
  id: 'loop-param-named-props-member',
  description: 'A .map() row parameter named props reads its own item members, not the component props',
  source: `
export function LoopParamNamedPropsMember({ rows }: { rows: { label: string }[] }) {
  return (
    <ul>
      {rows.map((props) => (
        <li key={props.label}>{props.label}</li>
      ))}
    </ul>
  )
}
`,
  props: { rows: [{ label: 'a' }, { label: 'b' }] },
  expectedHtml: `
    <ul bf-s="test" bf="s1">
      <li data-key="a"><!--bf:s0-->a<!--/--></li>
      <li data-key="b"><!--bf:s0-->b<!--/--></li>
    </ul>
  `,
})
