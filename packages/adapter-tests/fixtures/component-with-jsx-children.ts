import { createFixture } from '../src/types'

export const fixture = createFixture({
  id: 'component-with-jsx-children',
  description: 'Parent passes JSX children to a child component that renders props.children',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
import { Card } from './card'
export function Page() {
  const [x] = createSignal(0)
  return (
    <main data-x={x()}>
      <Card>
        <span>hello</span>
        <span>world</span>
      </Card>
    </main>
  )
}
`,
  components: {
    './card.tsx': `
'use client'
import type { JSX } from '@barefootjs/jsx/jsx-runtime'
type Child = JSX.Element | string | number | boolean | null | undefined | Child[]
export function Card(props: { children?: Child }) {
  return <section>{props.children ?? ''}</section>
}
`,
  },
  expectedHtml: `
    <main data-x="0" bf-s="test" bf="s1">
      <section bf-s="test_s0"><span>hello</span><span>world</span></section>
    </main>
  `,
})
