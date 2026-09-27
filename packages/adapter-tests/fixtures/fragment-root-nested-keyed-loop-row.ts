import { createFixture } from '../src/types'

/**
 * `fragment-root-keyed-loop-row` with the row component's fragment nested
 * inside another fragment (`<><><li/></></>` — the shape the mutation
 * sweep's `fragment-wrap` produces for a component whose body already is a
 * fragment). The inner fragment renders no DOM of its own, so the `<li>`
 * is still the row's first element: SSR must put `data-key` on it, the
 * same element the CSR runtime stamps the key on (`component.ts`'s
 * `roots.find(isElement)`). `markCarrierIn` (jsx-to-ir.ts) used to stop at
 * the nested fragment and leave the row keyless at SSR.
 */
export const fixture = createFixture({
  id: 'fragment-root-nested-keyed-loop-row',
  description: 'Row component whose fragment root nests another fragment: SSR still keys the first element (data-key)',
  componentName: 'FragmentRootNestedKeyedLoopRow',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type Todo = { id: number; text: string }
function TodoRow(props: { todo: Todo }) {
  return <><><li>{props.todo.text}</li></></>
}
export function FragmentRootNestedKeyedLoopRow(props: { items: Todo[] }) {
  const [todos] = createSignal<Todo[]>(props.items)
  return (
    <ul>
      {todos().map(todo => (
        <TodoRow key={todo.id} todo={todo} />
      ))}
    </ul>
  )
}
`,
  props: {
    items: [
      { id: 1, text: 'Eat breakfast' },
      { id: 2, text: 'Write tests' },
    ],
  },
  expectedHtml: `
    <ul bf-s="test" bf="s1">
      <li bf="s1" data-key="1"><!--bf:s0-->Eat breakfast<!--/--></li>
      <li bf="s1" data-key="2"><!--bf:s0-->Write tests<!--/--></li>
    </ul>
  `,
})
