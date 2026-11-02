import { createFixture } from '../src/types'

/**
 * A props-object body rest (`const { rows, ...rest } = props`) read and
 * spread inside a loop row named like the props object
 * (`rows.map(props => …)`). JS reads the component's `id` through the rest;
 * the compiler reads a body rest's keys off the props object, which the
 * row hides there, so both uses are refused (BF101) instead of reading the
 * row.
 */
export const fixture = createFixture({
  id: 'body-rest-props-name-shadowed',
  description: 'A body rest read or spread inside a row that shadows the props name is refused',
  source: `
export function BodyRestShadowedProps(props: { id?: string; rows: { key: string }[] }) {
  const { rows, ...rest } = props
  return (
    <div>
      <ul>{rows.map(props => <li key={props.key}>{props.key}:{rest.id}</li>)}</ul>
      <ol>{rows.map(props => <li key={props.key} {...rest}>{props.key}</li>)}</ol>
    </div>
  )
}
`,
  props: { id: 'outer', rows: [{ key: 'a' }, { key: 'b' }] },
  expectedHtml: `
    <div bf-s="test">
      <ul bf="s3">
        <li bf="s2" data-key="a"><!--bf:s0-->a<!--/-->:<!--bf:s1-->outer<!--/--></li>
        <li bf="s2" data-key="b"><!--bf:s0-->b<!--/-->:<!--bf:s1-->outer<!--/--></li>
      </ul>
      <ol bf="s6">
        <li bf="s5" data-key="a" id="outer"><!--bf:s4-->a<!--/--></li>
        <li bf="s5" data-key="b" id="outer"><!--bf:s4-->b<!--/--></li>
      </ol>
    </div>
  `,
})
