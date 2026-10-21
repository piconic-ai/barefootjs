import { createFixture } from '../src/types'

/**
 * A renamed body destructure whose default filters an earlier binding with a
 * callback (`destructure-default-body-renamed-callback-earlier`), forwarded
 * to a child component's prop: the child receives the filtered `a` when `b`
 * is omitted, and the client template renders the child in place rather than
 * deferring it to init.
 */
export const fixture = createFixture({
  id: 'destructure-default-body-renamed-callback-child',
  description: 'A renamed body destructure default holding a callback reaches a child component prop',
  source: `
'use client'
function CallbackCount(props: { xs: string[] }) {
  return <i>{props.xs.length}</i>
}
export function DestructureDefaultBodyRenamedCallbackChild(props: { a: string[]; b?: string[] }) {
  const { a, b: local = a.filter((x) => x !== '') } = props
  return <p><CallbackCount xs={local} /></p>
}
`,
  componentName: 'DestructureDefaultBodyRenamedCallbackChild',
  props: { a: ['y', ''] },
  expectedHtml: `
    <p bf-s="test"><i bf-s="test_s0" bf="s1"><!--bf:s0-->1<!--/--></i></p>
  `,
  dataPoints: [
    { name: 'b-present', props: { a: ['y', ''], b: ['p', 'q'] } },
    { name: 'b-empty', props: { a: ['y', ''], b: [] } },
  ],
})
