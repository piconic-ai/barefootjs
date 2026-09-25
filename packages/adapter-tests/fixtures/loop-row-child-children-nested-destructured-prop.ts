import { createFixture } from '../src/types'

/**
 * The destructured-param twin of `loop-row-child-children-nested-row-prop`:
 * the row binds its fields by destructuring (`({ id, tone }) => …`), and a
 * component nested in the row child's forwarded children receives one of
 * them (`<Mark tone={tone} />`), which differs between rows. The rows come
 * from a filtering memo over a module-scope array (all rows at SSR). The row
 * component is keyed by a destructured field too, so every row also carries
 * its own `data-key`; `loop-component-row-destructured-param` is the same
 * row shape without forwarded children.
 */
export const fixture = createFixture({
  id: 'loop-row-child-children-nested-destructured-prop',
  description:
    "A nested component inside a loop-row child's forwarded children receives a destructured row field as a prop at SSR",
  source: `
'use client'
import { createMemo, createSignal } from '@barefootjs/client'

function Chip({ children }: { children?: any }) {
  return <span class="chip">{children}</span>
}

function Mark({ tone }: { tone?: string }) {
  return <em data-tone={tone}></em>
}

type Opt = { id: string; tone: string }
const opts: Opt[] = [{ id: 'a', tone: 'warm' }, { id: 'b', tone: 'cool' }]

export function LoopRowChildChildrenNestedDestructuredProp() {
  const [only] = createSignal<string | null>(null)
  const shown = createMemo(() => {
    const id = only()
    if (!id) return opts
    return opts.filter(o => o.id === id)
  })
  return (
    <div>
      {shown().map(({ id, tone }) => (
        <Chip key={id}>
          <Mark tone={tone} />
        </Chip>
      ))}
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s2">
      <span bf-s="Chip_*" class="chip" data-key="a"><em bf-s="test_s0" bf="s0" data-tone="warm"></em></span>
      <span bf-s="Chip_*" class="chip" data-key="b"><em bf-s="test_s0" bf="s0" data-tone="cool"></em></span>
    </div>
  `,
})
