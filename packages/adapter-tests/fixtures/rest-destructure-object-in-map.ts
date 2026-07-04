import { createFixture } from '../src/types'

/**
 * Object rest destructure in a `.map()` callback (`{ id, title, ...rest }`).
 *
 * #1309 / #1244 added IR-level support for rest patterns and the Hono / CSR
 * emit path lowers them to an inline residual-object accessor
 * (`(({ id: __bfR0, title: __bfR1, ...__bfRest }) => __bfRest)(__bfItem())`).
 * The template adapters first lowered the member-read-only shape pinned
 * here (the rest binding aliased to the whole item, `rest.flag` read back
 * off it — #1310); #2087 generalized the destructure lowering (structured
 * `segments` accessors, slice-based array-rest, residual-bag object-rest
 * feeding the spread pipeline). All seven template adapters render this
 * fixture through their real engines; none pin a diagnostic for it.
 */
export const fixture = createFixture({
  id: 'rest-destructure-object-in-map',
  description: 'Object rest destructure in .map() callback (#1310)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

type Task = { id: string; title: string; flag: string }
export function RestObject() {
  const [tasks, setTasks] = createSignal<Task[]>([
    { id: 't1', title: 'one', flag: 'a' },
    { id: 't2', title: 'two', flag: 'b' },
  ])
  return (
    <ul onClick={() => setTasks(t => t)}>
      {tasks().map(({ id, title, ...rest }) => (
        <li key={id}>{title}:{rest.flag}</li>
      ))}
    </ul>
  )
}
`,
  expectedHtml: `
    <ul bf-s="test" bf="s2">
      <li data-key="t1"><!--bf:s0-->one<!--/-->:<!--bf:s1-->a<!--/--></li>
      <li data-key="t2"><!--bf:s0-->two<!--/-->:<!--bf:s1-->b<!--/--></li>
    </ul>
  `,
})
