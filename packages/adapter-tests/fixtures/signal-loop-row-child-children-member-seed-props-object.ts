import { createFixture } from '../src/types'

/**
 * `signal-loop-row-child-children-member-seed` with the props object
 * (`function C(props)`): signals seeded from `props.initial.items` and
 * `props.initial.tags`.
 */
export const fixture = createFixture({
  id: 'signal-loop-row-child-children-member-seed-props-object',
  description:
    "Signals seeded from props.initial members drive loops whose row is a child component with forwarded JSX children, rendering each row at SSR",
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

function Chip(props: { children?: any }) {
  return <span class="chip">{props.children}</span>
}

type Item = { id: string; label: string }

interface State {
  items: Item[]
  tags: string[]
}

export function SignalLoopRowChildChildrenMemberSeedPropsObject(props: { initial: State }) {
  const [rows] = createSignal(props.initial.items)
  const [tags] = createSignal(props.initial.tags)
  return (
    <div>
      <p class="member">{rows().map((item) => <Chip key={item.id}><b>{item.label}</b></Chip>)}</p>
      <p class="scalar">{tags().map((t) => <Chip key={t}><u>{t}</u></Chip>)}</p>
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
    },
  },
  expectedHtml: `
    <div bf-s="test">
      <p bf="s2" class="member">
        <span bf-s="Chip_*" class="chip" data-key="a"><b><!--bf:^s0-->Alpha<!--/--></b></span>
        <span bf-s="Chip_*" class="chip" data-key="b"><b><!--bf:^s0-->Beta<!--/--></b></span>
      </p>
      <p bf="s5" class="scalar">
        <span bf-s="Chip_*" class="chip" data-key="t1"><u><!--bf:^s3-->t1<!--/--></u></span>
        <span bf-s="Chip_*" class="chip" data-key="t2"><u><!--bf:^s3-->t2<!--/--></u></span>
      </p>
    </div>
  `,
})
