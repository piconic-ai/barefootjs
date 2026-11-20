import { createFixture } from '../src/types'

/**
 * Reads of a component-scope array const (#3953), each through a different
 * indirection: a memo over its `.length` and `.join`, a memo of that memo, an
 * alias of the const, an array held by an object const, a signal seeded from
 * its length, a memo whose callback param shadows the const's name, and a
 * child prop and an attribute reading it directly. A template has no binding
 * for the const, so each is computed from the array literal it stands for.
 */
export const fixture = createFixture({
  id: 'memo-over-array-const-shapes',
  description: 'Memos, signals and child props over a component-scope array const render what JS computes (#3953)',
  source: `
'use client'
import { createMemo, createSignal } from '@barefootjs/client'

function Kid(props: { n: number }) {
  return <i>{props.n}</i>
}

export function MemoOverArrayConstShapes() {
  const local = ['y', 'z']
  const alias = local
  const cfg = { tags: ['p', 'q', 'r'] }
  const n = createMemo(() => local.length)
  const twice = createMemo(() => n() * 2)
  const viaAlias = createMemo(() => alias.length)
  const joined = createMemo(() => local.join('-'))
  const tagCount = createMemo(() => cfg.tags.length)
  const [seeded] = createSignal(local.length)
  const shadowed = createMemo(() => [1, 2, 3].filter(local => local > 1).length)
  return (
    <div data-n={local.length}>
      <p>{n()}|{twice()}|{viaAlias()}|{joined()}|{tagCount()}|{seeded()}|{shadowed()}</p>
      <Kid n={n()} />
      <Kid n={local.length} />
    </div>
  )
}
`,
  props: {},
  expectedHtml: `
    <div bf-s="test" data-n="2">
      <p bf="s7"><!--bf:s0-->2<!--/-->|<!--bf:s1-->4<!--/-->|<!--bf:s2-->2<!--/-->|<!--bf:s3-->y-z<!--/-->|<!--bf:s4-->3<!--/-->|<!--bf:s5-->2<!--/-->|<!--bf:s6-->2<!--/--></p>
      <i bf-s="test_s8" bf="s1"><!--bf:s0-->2<!--/--></i>
      <i bf-s="test_s9" bf="s1"><!--bf:s0-->2<!--/--></i>
    </div>
  `,
})
