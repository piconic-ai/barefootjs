import { createFixture } from '../src/types'

/**
 * A renamed body destructure whose default filters an earlier binding with a
 * callback (`destructure-default-body-renamed-callback-earlier`), read from
 * an attribute and a condition: both positions take the filtered `a` when
 * `b` is omitted.
 */
export const fixture = createFixture({
  id: 'destructure-default-body-renamed-callback-positions',
  description: 'A renamed body destructure default holding a callback renders in an attribute and a condition',
  source: `
'use client'
export function DestructureDefaultBodyRenamedCallbackPositions(props: { a: string[]; b?: string[] }) {
  const { a, b: rows = a.filter((x) => x !== '') } = props
  return <div data-n={rows.length}>{rows.length > 0 ? <b>some</b> : <i>none</i>}</div>
}
`,
  props: { a: ['y', '', 'z'] },
  expectedHtml: `
    <div bf-s="test" bf="s1" data-n="2"><b bf-c="s0">some</b></div>
  `,
  dataPoints: [
    { name: 'b-present', props: { a: ['y', '', 'z'], b: ['p'] } },
    { name: 'b-empty', props: { a: ['y', '', 'z'], b: [] } },
  ],
})
