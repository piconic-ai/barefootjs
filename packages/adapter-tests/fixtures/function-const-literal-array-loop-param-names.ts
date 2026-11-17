import { createFixture } from '../src/types'

/**
 * Sibling of `module-const-literal-array-loop` (#3798): a function-scope
 * literal array, and a loop param named like a prop (`id` next to
 * `props.id`) or like a string in the row (`'id'`). The row reads its own
 * value; `props.id` reads the prop.
 */
export const fixture = createFixture({
  id: 'function-const-literal-array-loop-param-names',
  description: 'A function-scope literal array loop whose param shares a name with a prop reads the row and the prop apart (#3798)',
  source: `
export function FunctionConstLiteralArrayLoopParamNames(props: { label: string; id: string }) {
  const LOCAL = ['u', 'id']
  return (
    <ol>
      {LOCAL.map(id => (
        <li key={id} data-same={id === 'u' ? props.id : id} data-eq={id === 'id' ? props.label : 'other'}>
          {id}
        </li>
      ))}
    </ol>
  )
}
`,
  props: { label: 'L', id: 'P' },
  expectedHtml: `
    <ol bf-s="test" bf="s2">
      <li bf="s1" data-eq="other" data-key="u" data-same="P"><!--bf:s0-->u<!--/--></li>
      <li bf="s1" data-eq="L" data-key="id" data-same="id"><!--bf:s0-->id<!--/--></li>
    </ol>
  `,
})
