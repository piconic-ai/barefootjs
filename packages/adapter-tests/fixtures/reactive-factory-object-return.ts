import { createFixture } from '../src/types'

export const fixture = createFixture({
  id: 'reactive-factory-object-return',
  description:
    'Same-file reactive-factory helper returning a shorthand object (#2325) inlines to a plain signal, identically to counter.ts',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

function createCounter(initial: number) {
  const [count, setCount] = createSignal(initial)
  return { count, setCount }
}

export function Counter() {
  const { count, setCount } = createCounter(0)
  return <button onClick={() => setCount(n => n + 1)}>Count: {count()}</button>
}
`,
  expectedHtml: `
    <button bf-s="test" bf="s1">Count: <!--bf:s0-->0<!--/--></button>
  `,
})
