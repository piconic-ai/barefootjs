import { createFixture } from '../src/types'

/**
 * A loop over a SIGNAL array whose row is a child component with forwarded
 * JSX children (`rows().map(o => <Chip key={o.id}><b>{o.id}</b></Chip>)`).
 * The module-const twin (`opts.map(…)`) is the
 * `loop-row-child-children-*` family.
 */
export const fixture = createFixture({
  id: 'signal-loop-row-child-children',
  description: "A signal-array loop whose row is a child component with forwarded JSX children renders each row at SSR",
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

function Chip({ children }: { children?: any }) {
  return <span class="chip">{children}</span>
}

export function SignalLoopRowChildChildren() {
  const [rows] = createSignal([{ id: 'a' }, { id: 'b' }])
  return <p>{rows().map((o) => <Chip key={o.id}><b>{o.id}</b></Chip>)}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s2">
      <span bf-s="Chip_*" class="chip" data-key="a"><b><!--bf:^s0-->a<!--/--></b></span>
      <span bf-s="Chip_*" class="chip" data-key="b"><b><!--bf:^s0-->b<!--/--></b></span>
    </p>
  `,
})
