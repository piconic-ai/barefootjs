import { createFixture } from '../src/types'

/**
 * Object rest destructure in a `.map()` callback (`{ id, title, ...rest }`).
 *
 * #1309 / #1244 added IR-level support for rest patterns and the Hono / CSR
 * emit path lowers them to an inline residual-object accessor
 * (`(({ id: __bfR0, title: __bfR1, ...__bfRest }) => __bfRest)(__bfItem())`).
 * Text-template adapters (Go, Mojo) have no analogous lowering — they
 * already refuse any loop destructure (`paramBindings.length > 0`) with
 * BF104, but no fixture pinned that contract for the rest variant.
 *
 * This fixture lets each adapter declare its position against the rest
 * shape (currently both Go and Mojo expect BF104 via `expectedDiagnostics`).
 * When either adapter grows a native lowering, dropping the diagnostic
 * here is the single edit that flips the contract on. See #1310.
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
