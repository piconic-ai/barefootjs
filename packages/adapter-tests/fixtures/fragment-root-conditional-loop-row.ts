import { createFixture } from '../src/types'

/**
 * A fragment-rooted keyed `.map()` row whose ONLY top-level child is a
 * ternary — `<>{done ? <li class="done"/> : <li/>}</>`.
 *
 * `fragment-root-keyed-loop-row` covers the flat shape, where the
 * fragment's first top-level child IS the element. This one is the same
 * single-visual-root row expressed as a conditional: exactly one `<li>`
 * renders, but the fragment's `children` array holds a single
 * `IRConditional` with the elements nested in `whenTrue` / `whenFalse`.
 *
 * `markDataKeyCarrier` originally located the carrier with a flat
 * `children.findIndex(c => c.type === 'element')`, which returns -1 here —
 * so `carriesDataKey` was never set on either branch and SSR omitted
 * `data-key` entirely, reproducing #2732's own symptom for a shape the fix
 * was meant to cover. Both branches are marked, since they are mutually
 * exclusive at render time and marking only `whenTrue` would drop the key
 * exactly when the condition is false — which is why this fixture's props
 * deliberately include one row of each polarity.
 */
export const fixture = createFixture({
  id: 'fragment-root-conditional-loop-row',
  description: 'Fragment-rooted keyed .map() row whose only child is a ternary (#2732)',
  componentName: 'FragmentRootConditionalLoopRow',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type Todo = { id: number; text: string; done: boolean }
function TodoRow(props: { todo: Todo }) {
  return <>{props.todo.done ? <li class="done">{props.todo.text}</li> : <li>{props.todo.text}</li>}</>
}
export function FragmentRootConditionalLoopRow(props: { items: Todo[] }) {
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
      { id: 1, text: 'Eat breakfast', done: true },
      { id: 2, text: 'Write tests', done: false },
    ],
  },
  expectedHtml: `
    <ul bf-s="test" bf="s1">
      <li bf-c="s0" bf="s2" class="done" data-key="1"><!--bf:s1-->Eat breakfast<!--/--></li>
      <li bf-c="s0" bf="s4" data-key="2"><!--bf:s3-->Write tests<!--/--></li>
    </ul>
  `,
})
