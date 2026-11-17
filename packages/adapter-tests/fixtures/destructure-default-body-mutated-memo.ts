import { createFixture } from '../src/types'

/**
 * A body destructure default mutated after its declaration
 * (`local.push('z')`) and read through a memo (`createMemo(() => local.length)`).
 * In JS the memo sees the pushed element (`2`). A top-level body statement
 * runs only on the client at mount (the server render is a snapshot of the
 * declarations), so the reference renders `1` here and the hydrated client
 * shows `2`: the limitation `init-statement-mutation-unrun-on-server`. The
 * CSR template cannot run the statement or inline the memo over a mutated
 * binding, and renders empty.
 */
export const fixture = createFixture({
  id: 'destructure-default-body-mutated-memo',
  description: 'A body destructure binding mutated after its declaration, read through a memo, renders the mutated value',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
export function DestructureDefaultBodyMutatedMemo(props: { b?: string[] }) {
  const { b: local = ['y', ''].filter((x) => x !== '') } = props
  local.push('z')
  const n = createMemo(() => local.length)
  return <p>{n()}</p>
}
`,
  props: {},
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->1<!--/--></p>
  `,
})
