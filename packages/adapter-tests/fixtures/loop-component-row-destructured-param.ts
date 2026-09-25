import { createFixture } from '../src/types'

/**
 * A `.map()` loop whose callback destructures its row param
 * (`({ id, tone }) => …`) and whose row body is a component
 * (`<Mark key={id} tone={tone} />`). Every row renders once, with its own
 * key and prop. The rows come from a filtering memo over a module-scope
 * array (all rows at SSR).
 */
export const fixture = createFixture({
  id: 'loop-component-row-destructured-param',
  description: 'A component loop row whose callback destructures the row param renders every row with its own key and prop',
  source: `
'use client'
import { createMemo, createSignal } from '@barefootjs/client'

function Mark({ tone }: { tone?: string }) {
  return <em data-tone={tone}></em>
}

type Opt = { id: string; tone: string }
const opts: Opt[] = [{ id: 'a', tone: 'warm' }, { id: 'b', tone: 'cool' }]

export function LoopComponentRowDestructuredParam() {
  const [only] = createSignal<string | null>(null)
  const shown = createMemo(() => {
    const id = only()
    if (!id) return opts
    return opts.filter(o => o.id === id)
  })
  return (
    <div>
      {shown().map(({ id, tone }) => (
        <Mark key={id} tone={tone} />
      ))}
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s1">
      <em bf-s="Mark_*" bf="s0" data-key="a" data-tone="warm"></em>
      <em bf-s="Mark_*" bf="s0" data-key="b" data-tone="cool"></em>
    </div>
  `,
})
