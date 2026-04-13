import { createFixture } from '../src/types'

export const fixture = createFixture({
  id: 'child-component-init',
  description: 'Parent initializes child component with signal-derived props',
  source: `
'use client'
import { createSignal } from '@barefootjs/client-runtime'
import { Label } from './label'
export function Parent() {
  const [text, setText] = createSignal('hello')
  return <div><Label value={text()} /><button onClick={() => setText('world')}>Change</button></div>
}
`,
  components: {
    './label.tsx': `
export function Label({ value }: { value: string }) {
  return <span>{value}</span>
}
`,
  },
  expectedHtml: `
    Internal Server Error
  `,
})
