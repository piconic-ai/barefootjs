import { createFixture } from '../src/types'

/**
 * A binding a body statement writes after its declaration (`items.push('z')`)
 * handed to a child component as a prop. In JS the child reads the pushed
 * element (`2`). A server render runs no body statement: the reference hands
 * the child the array as declared and renders `1`, and the template adapters,
 * which do not pass on a binding whose declared value a statement changes,
 * render `0`. The client's init runs the statement and passes the child the
 * live binding, so the hydrated DOM shows `2`: the limitation
 * `init-statement-mutation-unrun-on-server`. `checkStatementWrites` refuses
 * the same binding read by this component's own markup, but not a value
 * handed on: a receiver may read it only on the client (a `ref` callback, an
 * event handler), where it is right.
 *
 * `expectedHtml` is hand-authored to the JS value (`SKIP_AUTO_UPDATE`), and
 * every adapter is pinned in its `renderDivergences`.
 * Running the body's statements on the server graduates the fixture: delete
 * the pins and the limitation entry.
 */
export const fixture = createFixture({
  id: 'body-statement-write-child-prop',
  description: 'A binding a body statement writes, handed to a child as a prop, renders the written value',
  source: `
'use client'
function BodyStatementWriteChild(props: { items: string[] }) {
  return <i>{props.items.length}</i>
}
export function BodyStatementWriteChildProp() {
  const items = ['y']
  items.push('z')
  return <div><BodyStatementWriteChild items={items} /></div>
}
`,
  expectedHtml: `
    <div bf-s="test"><i bf-s="test_s0" bf="s1"><!--bf:s0-->2<!--/--></i></div>
  `,
})
