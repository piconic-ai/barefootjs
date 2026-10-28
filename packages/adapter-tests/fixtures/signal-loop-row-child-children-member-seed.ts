import { createFixture } from '../src/types'

/**
 * `signal-loop-row-child-children` with a signal seeded from a member of an
 * object prop: `initial.items` (objects), `initial.inner.items` (a nested
 * member) and `initial.tags` (strings). The props-object twin is
 * `signal-loop-row-child-children-member-seed-props-object`.
 */
export const fixture = createFixture({
  id: 'signal-loop-row-child-children-member-seed',
  description:
    "Signals seeded from an object prop's members drive loops whose row is a child component with forwarded JSX children, rendering each row at SSR",
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

function Chip({ children }: { children?: any }) {
  return <span class="chip">{children}</span>
}

type Item = { id: string; label: string }

interface State {
  items: Item[]
  tags: string[]
  inner: { items: Item[] }
}

export function SignalLoopRowChildChildrenMemberSeed({ initial }: { initial: State }) {
  const [rows] = createSignal(initial.items)
  const [nested] = createSignal(initial.inner.items)
  const [tags] = createSignal(initial.tags)
  return (
    <div>
      <p class="member">{rows().map((item) => <Chip key={item.id}><b>{item.label}</b></Chip>)}</p>
      <p class="nested">{nested().map((item) => <Chip key={item.id}><i>{item.label}</i></Chip>)}</p>
      <p class="scalar">{tags().map((t, i) => <Chip key={t}><u>{t}-{i}</u></Chip>)}</p>
    </div>
  )
}
`,
  props: {
    initial: {
      items: [
        { id: 'a', label: 'Alpha' },
        { id: 'b', label: 'Beta' },
      ],
      tags: ['t1', 't2'],
      inner: { items: [{ id: 'n', label: 'Nested' }] },
    },
  },
  expectedHtml: `
    <div bf-s="test">
      <p bf="s2" class="member">
        <span bf-s="Chip_*" class="chip" data-key="a"><b><!--bf:^s0-->Alpha<!--/--></b></span>
        <span bf-s="Chip_*" class="chip" data-key="b"><b><!--bf:^s0-->Beta<!--/--></b></span>
      </p>
      <p bf="s5" class="nested"><span bf-s="Chip_*" class="chip" data-key="n"><i><!--bf:^s3-->Nested<!--/--></i></span></p>
      <p bf="s9" class="scalar">
        <span bf-s="Chip_*" class="chip" data-key="t1"><u><!--bf:^s6-->t1<!--/-->-<!--bf:^s7-->0<!--/--></u></span>
        <span bf-s="Chip_*" class="chip" data-key="t2"><u><!--bf:^s6-->t2<!--/-->-<!--bf:^s7-->1<!--/--></u></span>
      </p>
    </div>
  `,
})
