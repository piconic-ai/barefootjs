import { createFixture } from '../src/types'

/**
 * The `/* @client *\/` twin of `loop-row-child-children-nested-row-prop`: a
 * component nested in a loop-row child's forwarded children receives a
 * row-item field marked `/* @client *\/`. The reference still renders each
 * row's own value at SSR.
 */
export const fixture = createFixture({
  id: 'loop-row-child-children-nested-client-row-prop',
  description:
    "A `/* @client */` row-reading prop on a nested component inside a loop-row child's forwarded children still renders per row at SSR",
  source: `
'use client'
function Chip({ children }: { children?: any }) {
  return <span class="chip">{children}</span>
}

function Mark({ tone }: { tone?: string }) {
  return <em data-tone={tone}></em>
}

type Opt = { id: string; tone: string }
const opts: Opt[] = [{ id: 'a', tone: 'warm' }, { id: 'b', tone: 'cool' }]

export function LoopRowChildChildrenNestedClientRowProp() {
  return (
    <div>
      {opts.map(o => (
        <Chip key={o.id}>
          <Mark tone={/* @client */ o.tone} />
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
