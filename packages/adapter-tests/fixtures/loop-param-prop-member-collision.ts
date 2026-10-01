import { createFixture } from '../src/types'

export const fixture = createFixture({
  id: 'loop-param-prop-member-collision',
  description: 'An explicit prop member remains a root value when a loop binds the same name',
  source: `
export function PropMember(props: { values: string[]; value: number }) {
  return <ul>{props.values.map(value => <li key={value}>
    {props.value === 4 ? 'on' : 'off'}
  </li>)}</ul>
}
`,
  props: { values: ['a', 'b'], value: 4 },
  expectedHtml: `
    <ul bf-s="test" bf="s2">
      <li bf="s1" data-key="a"><!--bf-cond-start:s0-->on<!--bf-cond-end:s0--></li>
      <li bf="s1" data-key="b"><!--bf-cond-start:s0-->on<!--bf-cond-end:s0--></li>
    </ul>
  `,
})
