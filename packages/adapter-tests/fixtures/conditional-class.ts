import { createFixture } from '../src/types'

export const fixture = createFixture({
  id: 'conditional-class',
  description: 'Conditional className via ternary expression',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function ConditionalClass() {
  const [active, setActive] = createSignal(false)
  return <div className={active() ? 'on' : 'off'}>Toggle</div>
}
`,
  expectedHtml: `
    <div class="off" bf-s="test" bf="s0">Toggle</div>
  `,
})
