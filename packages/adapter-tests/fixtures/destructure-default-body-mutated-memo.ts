import { createFixture } from '../src/types'

/**
 * A body destructure default mutated after its declaration
 * (`local.push('z')`) and read through a memo (`createMemo(() => local.length)`).
 * In JS the memo sees the pushed element (`2`). A top-level body statement
 * runs only on the client at mount (the server render is a snapshot of the
 * declarations), so every server render, Hono included, gives `1` while the
 * hydrated client shows `2`: the limitation
 * `init-statement-mutation-unrun-on-server`. `expectedHtml` is hand-authored
 * to the JS value (`SKIP_AUTO_UPDATE`), and every adapter that renders `1`
 * is pinned in its `renderDivergences`. The CSR template cannot run the
 * statement or inline the memo over a mutated binding, and renders empty
 * (`CSR_RENDER_DIVERGENCES`). Emitting the statement on the server graduates
 * the fixture: delete the pins and the limitation entry.
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
    <p bf-s="test" bf="s1"><!--bf:s0-->2<!--/--></p>
  `,
})
