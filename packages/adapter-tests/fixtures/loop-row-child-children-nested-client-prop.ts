import { createFixture } from '../src/types'

/**
 * The `/* @client *\/` twin of `loop-row-child-children-nested-reactive-prop`:
 * a component nested in a loop-row child's forwarded children receives a
 * signal-derived prop marked `/* @client *\/`. The directive does not keep
 * the prop out of the server render — the reference renders it from the
 * signal's initial value, exactly as it does outside a loop.
 */
export const fixture = createFixture({
  id: 'loop-row-child-children-nested-client-prop',
  description:
    "A `/* @client */` prop on a nested component inside a loop-row child's forwarded children still renders at SSR",
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

function Chip({ children }: { children?: any }) {
  return <span class="chip">{children}</span>
}

function Mark({ on }: { on?: boolean }) {
  return <em data-hl={on ? '' : undefined}></em>
}

type Opt = { id: string }
const opts: Opt[] = [{ id: 'a' }, { id: 'b' }]

export function LoopRowChildChildrenNestedClientProp() {
  const [hl] = createSignal(true)
  return (
    <div>
      {opts.map(o => (
        <Chip key={o.id}>
          <Mark on={/* @client */ hl()} />
        </Chip>
      ))}
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s2">
      <span bf-s="Chip_*" class="chip" data-key="a"><em bf-s="test_s0" bf="s0" data-hl=""></em></span>
      <span bf-s="Chip_*" class="chip" data-key="b"><em bf-s="test_s0" bf="s0" data-hl=""></em></span>
    </div>
  `,
})
