import { createFixture } from '../src/types'

/**
 * Sibling of `optional-chain-length-string-receiver` (#3422): the optional
 * `text` prop is read as an optional-chain receiver and `count` under a
 * `??`, so both must hold an absent value, and both are forwarded into a
 * child's required `string` / `number` props, directly and through an
 * identity memo. Adapters that type the props for the absent case must
 * still hand the child a concrete value.
 */
export const fixture = createFixture({
  id: 'optional-chain-receiver-forwarded-child',
  description: 'An optional prop read as an optional-chain receiver and forwarded into a required scalar child prop renders in both places',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'

type Props = { text?: string; count?: number }

function Child({ text, count }: { text: string; count: number }) {
  return <span className="child">{text}:{count}</span>
}

export function OptionalChainReceiverForwardedChild(props: Props) {
  const relayed = createMemo(() => props.text!)
  return (
    <div>
      <p>{props.text?.length}|{props.count ?? 'none'}</p>
      <Child text={props.text!} count={props.count!} />
      <Child text={relayed()} count={props.count!} />
    </div>
  )
}
`,
  props: { text: 'ab', count: 3 },
  expectedHtml: `
    <div bf-s="test">
      <p bf="s2"><!--bf:s0-->2<!--/-->|<!--bf:s1-->3<!--/--></p>
      <span bf-s="test_s3" bf="s2" class="child"><!--bf:s0-->ab<!--/-->:<!--bf:s1-->3<!--/--></span>
      <span bf-s="test_s4" bf="s2" class="child"><!--bf:s0-->ab<!--/-->:<!--bf:s1-->3<!--/--></span>
    </div>
  `,
})
