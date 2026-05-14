import { createFixture } from '../src/types'

export const fixture = createFixture({
  id: 'boolean-dynamic-attr',
  description: 'Dynamic boolean attribute uses DOM property binding',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function BooleanDynamic() {
  const [disabled, setDisabled] = createSignal(false)
  return <button disabled={disabled()} onClick={() => setDisabled(v => !v)}>Click</button>
}
`,
  expectedHtml: `
    <button bf-s="test" bf="s0">Click</button>
  `,
})
