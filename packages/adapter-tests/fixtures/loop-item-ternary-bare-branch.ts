import { createFixture } from '../src/types'

/**
 * A keyed loop item whose reactive conditional's TRUE branch is a bare
 * property read on the loop param (`task.label`, no wrapping element, no
 * call) — the shape that used to freeze forever when an item's value
 * changed without its `done` condition flipping (the loop-branch-stale-text
 * defect). `transformConditionalBranch` (jsx-to-ir.ts) now allocates this
 * branch its own `slotId` because it reads the loop item (`refsLoopParam`),
 * which is why the expected HTML below has an inner `<!--bf:s1-->Write
 * it<!--/-->` marker nested INSIDE the outer `bf-cond-start:s0`/
 * `bf-cond-end:s0` pair — before this fix the branch had no marker of its
 * own at all, and no per-item update effect either. Contrast
 * `conditional-wrapping-loop.ts`, whose branches are plain string literals
 * (`'[x]'` / `'[ ]'`, no loop-param reference, no call) and so correctly
 * get no inner marker either before or after this fix — that fixture is
 * the "nothing to collect" control this one must not disturb.
 */
export const fixture = createFixture({
  id: 'loop-item-ternary-bare-branch',
  description: 'Keyed loop item whose ternary true-branch is a bare loop-param property read',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type Task = { name: string; label: string; done: boolean }
export function LoopItemTernaryBareBranch() {
  const [tasks] = createSignal<Task[]>([
    { name: 'write', label: 'Write it', done: true },
    { name: 'review', label: 'Review it', done: false },
  ])
  return (
    <ul>
      {tasks().map(task => (
        <li key={task.name}>{task.done ? task.label : 'pending'}</li>
      ))}
    </ul>
  )
}
`,
  expectedHtml: `
    <ul bf-s="test" bf="s2">
      <li data-key="write"><!--bf-cond-start:s0--><!--bf:s1-->Write it<!--/--><!--bf-cond-end:s0--></li>
      <li data-key="review"><!--bf-cond-start:s0-->pending<!--bf-cond-end:s0--></li>
    </ul>
  `,
})
