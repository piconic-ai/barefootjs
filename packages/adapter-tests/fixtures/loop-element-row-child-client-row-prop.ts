import { createFixture } from '../src/types'

/**
 * A component nested in an ELEMENT loop row (`<li><Mark …/></li>`) receives a
 * row-item field marked `/* @client *\/`. The reference still renders each
 * row's own value at SSR. The rows come from a filtering memo over a
 * module-scope array (all rows at SSR).
 */
export const fixture = createFixture({
  id: 'loop-element-row-child-client-row-prop',
  description: 'A `/* @client */` row-reading prop on a component inside an element loop row still renders per row at SSR',
  source: `
'use client'
import { createMemo, createSignal } from '@barefootjs/client'

function Mark({ tone }: { tone?: string }) {
  return <em data-tone={tone}></em>
}

type Opt = { id: string; tone: string }
const opts: Opt[] = [{ id: 'a', tone: 'warm' }, { id: 'b', tone: 'cool' }]

export function LoopElementRowChildClientRowProp() {
  const [only] = createSignal<string | null>(null)
  const shown = createMemo(() => {
    const id = only()
    if (!id) return opts
    return opts.filter(o => o.id === id)
  })
  return (
    <ul>
      {shown().map(o => (
        <li key={o.id}>
          <Mark tone={/* @client */ o.tone} />
        </li>
      ))}
    </ul>
  )
}
`,
  expectedHtml: `
    <ul bf-s="test" bf="s1">
      <li data-key="a"><em bf-s="test_s0" bf="s0" data-tone="warm"></em></li>
      <li data-key="b"><em bf-s="test_s0" bf="s0" data-tone="cool"></em></li>
    </ul>
  `,
})
