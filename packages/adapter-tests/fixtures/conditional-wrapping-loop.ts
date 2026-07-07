import { createFixture } from '../src/types'

/**
 * A `&&` conditional whose consequent CONTAINS a keyed loop, and each
 * loop item contains its own ternary — conditional → loop → conditional
 * nesting in one tree. The inverse nesting (loop item containing a
 * conditional, no outer guard) is pinned by `loop-item-conditional`.
 */
export const fixture = createFixture({
  id: 'conditional-wrapping-loop',
  description: 'Conditional wrapping a keyed loop whose items hold ternaries',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type Task = { name: string; done: boolean }
export function ConditionalWrappingLoop() {
  const [show, setShow] = createSignal(true)
  const [tasks, setTasks] = createSignal<Task[]>([
    { name: 'write', done: true },
    { name: 'review', done: false },
  ])
  return (
    <div>
      {show() && (
        <ul>
          {tasks().map(task => (
            <li key={task.name}>{task.done ? '[x]' : '[ ]'} {task.name}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s4"><ul bf-c="s0" bf="s3"><li data-key="write"><!--bf-cond-start:s1-->[x]<!--bf-cond-end:s1--><!--bf:s2-->write<!--/--></li><li data-key="review"><!--bf-cond-start:s1-->[ ]<!--bf-cond-end:s1--><!--bf:s2-->review<!--/--></li></ul></div>
  `,
})
