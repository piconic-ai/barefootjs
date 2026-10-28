import { createFixture } from '../src/types'

/**
 * `signal-loop-row-child-children-shapes` with the props object
 * (`function C(props)`): a signal seeded from `props.items` drives a loop
 * whose row is a child component with forwarded JSX children.
 */
export const fixture = createFixture({
  id: 'signal-loop-row-child-children-props-object',
  description:
    "A signal seeded from props.items drives a loop whose row is a child component with forwarded JSX children, rendering each row at SSR",
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

function Chip(props: { children?: any }) {
  return <span class="chip">{props.children}</span>
}

export function SignalLoopRowChildChildrenPropsObject(props: { items: { id: string; n: number }[] }) {
  const [rows] = createSignal(props.items)
  return <p>{rows().map((o, i) => <Chip key={o.id}><b>{o.id}:{o.n}#{i}</b></Chip>)}</p>
}
`,
  props: {
    items: [
      { id: 'a', n: 1 },
      { id: 'b', n: 2.5 },
    ],
  },
  expectedHtml: `
    <p bf-s="test" bf="s4">
      <span bf-s="Chip_*" class="chip" data-key="a"><b><!--bf:^s0-->a<!--/-->:<!--bf:^s1-->1<!--/-->#<!--bf:^s2-->0<!--/--></b></span>
      <span bf-s="Chip_*" class="chip" data-key="b"><b><!--bf:^s0-->b<!--/-->:<!--bf:^s1-->2.5<!--/-->#<!--bf:^s2-->1<!--/--></b></span>
    </p>
  `,
})
