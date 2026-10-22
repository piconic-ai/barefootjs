import { createFixture } from '../src/types'

/**
 * A renamed body destructure whose default passes a callback to a call
 * (`const { b: local = ['y', ''].filter((x) => x !== '') } = props`), read
 * in the markup: an omitted `b` takes the filtered array. The client
 * template reads `local` as the prop `b` with its default, the same read the
 * parameter form `function C({ b: local = … })` gets, not as an inlined
 * const (a callback in the default kept the const out of the template).
 */
export const fixture = createFixture({
  id: 'destructure-default-body-renamed-callback',
  description: 'A renamed body destructure default holding a callback renders its value when the prop is omitted',
  source: `
'use client'
export function DestructureDefaultBodyRenamedCallback(props: { b?: string[] }) {
  const { b: local = ['y', ''].filter((x) => x !== '') } = props
  return <p>{local.length}</p>
}
`,
  props: {},
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->1<!--/--></p>
  `,
  dataPoints: [
    { name: 'b-present', props: { b: ['p', 'q', 'r'] } },
    { name: 'b-empty', props: { b: [] } },
  ],
})
