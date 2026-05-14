import { createFixture } from '../src/types'

export const fixture = createFixture({
  id: 'effect',
  description: 'Component with createEffect (SSR renders initial state only)',
  source: `
'use client'
import { createSignal, createEffect } from '@barefootjs/client'
export function EffectDemo() {
  const [count, setCount] = createSignal(0)
  createEffect(() => { console.log(count()) })
  return <div>{count()}</div>
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s1"><!--bf:s0-->0<!--/--></div>
  `,
})
