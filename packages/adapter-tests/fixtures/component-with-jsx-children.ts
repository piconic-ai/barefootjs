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
export function Card(props: { children?: unknown }) {
  return <section>{props.children ?? ''}</section>
}
`,
  },
  expectedHtml: `
    <main bf-s="test" bf="s1" data-x="0"><section bf-s="test_s0"><span>hello</span><span>world</span></section></main>
  `,
})
