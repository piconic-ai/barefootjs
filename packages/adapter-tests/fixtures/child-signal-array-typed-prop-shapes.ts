import { createFixture } from '../src/types'

/**
 * Sibling of `child-signal-array-typed-prop`: number (a fraction
 * included) and boolean arrays, an empty array, and the string array read
 * through an identity memo and through a memo of that memo.
 */
export const fixture = createFixture({
  id: 'child-signal-array-typed-prop-shapes',
  description: "Signals seeded with number, boolean and empty array literals, and identity memos over one, reach a static child's typed array prop",
  source: `
'use client'
import { createSignal, createMemo } from '@barefootjs/client'

function Strs(props: { items: string[] }) {
  return <ul>{props.items.map(i => <li key={i}>{i}</li>)}</ul>
}

function Nums(props: { items: number[] }) {
  return <ol>{props.items.map(i => <li key={i}>{i}</li>)}</ol>
}

function Flags(props: { items: boolean[] }) {
  return <p>{props.items.map((b, i) => <b key={i}>{String(b)}</b>)}</p>
}

export function ChildSignalArrayTypedPropShapes() {
  const [strs] = createSignal(['a', 'b'])
  const [nums] = createSignal([1, 2.5])
  const [flags] = createSignal([true, false])
  const [none] = createSignal([])
  const same = createMemo(() => strs())
  const again = createMemo(() => same())
  return (
    <div>
      <Nums items={nums()} />
      <Flags items={flags()} />
      <Strs items={none()} />
      <Strs items={same()} />
      <Strs items={again()} />
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test">
      <ol bf-s="test_s0" bf="s1">
        <li data-key="1"><!--bf:s0-->1<!--/--></li>
        <li data-key="2.5"><!--bf:s0-->2.5<!--/--></li>
      </ol>
      <p bf-s="test_s1" bf="s1">
        <b data-key="0"><!--bf:s0-->true<!--/--></b>
        <b data-key="1"><!--bf:s0-->false<!--/--></b>
      </p>
      <ul bf-s="test_s2" bf="s1"></ul>
      <ul bf-s="test_s3" bf="s1">
        <li data-key="a"><!--bf:s0-->a<!--/--></li>
        <li data-key="b"><!--bf:s0-->b<!--/--></li>
      </ul>
      <ul bf-s="test_s4" bf="s1">
        <li data-key="a"><!--bf:s0-->a<!--/--></li>
        <li data-key="b"><!--bf:s0-->b<!--/--></li>
      </ul>
    </div>
  `,
})
