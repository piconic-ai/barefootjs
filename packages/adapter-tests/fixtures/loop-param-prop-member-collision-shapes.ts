import { createFixture } from '../src/types'

/**
 * Sibling of `loop-param-prop-member-collision`: an explicit `props.X` read
 * stays the root prop wherever a loop binding named `X` shadows it — in a
 * nested loop that binds the same name again, in two sibling loops that each
 * bind it, and for a loop INDEX named like a prop. The row's own binding
 * still reads the row.
 */
export const fixture = createFixture({
  id: 'loop-param-prop-member-collision-shapes',
  description: 'An explicit prop member stays the root value under nested, sibling and index loop bindings of the same name',
  source: `
export function PropMemberShapes(props: { values: string[]; value: string; index: string }) {
  return (
    <div>
      <ul>{props.values.map(value => (
        <li key={value} data-row={value} data-root={props.value}>
          {props.values.map(value => <i key={value} data-row={value} data-root={props.value} />)}
        </li>
      ))}</ul>
      <ol>{props.values.map(value => <li key={value} data-root={props.value} />)}</ol>
      <p>{props.values.map((v, index) => <b key={v} data-i={index} data-root={props.index} />)}</p>
    </div>
  )
}
`,
  props: { values: ['a', 'b'], value: 'root', index: 'idx' },
  expectedHtml: `
    <div bf-s="test">
      <ul bf="s2">
        <li bf="s1" data-key="a" data-root="root" data-row="a">
          <i bf="s0" data-key-1="a" data-root="root" data-row="a"></i>
          <i bf="s0" data-key-1="b" data-root="root" data-row="b"></i>
        </li>
        <li bf="s1" data-key="b" data-root="root" data-row="b">
          <i bf="s0" data-key-1="a" data-root="root" data-row="a"></i>
          <i bf="s0" data-key-1="b" data-root="root" data-row="b"></i>
        </li>
      </ul>
      <ol bf="s4">
        <li bf="s3" data-key="a" data-root="root"></li>
        <li bf="s3" data-key="b" data-root="root"></li>
      </ol>
      <p bf="s6">
        <b bf="s5" data-i="0" data-key="a" data-root="idx"></b>
        <b bf="s5" data-i="1" data-key="b" data-root="idx"></b>
      </p>
    </div>
  `,
})
