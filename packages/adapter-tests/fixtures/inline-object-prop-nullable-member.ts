import { createFixture } from '../src/types'

/**
 * A props member typed as a union of an inline object type and `null`, read
 * behind a presence check.
 */
export const fixture = createFixture({
  id: 'inline-object-prop-nullable-member',
  description: 'A props member typed as a nullable inline object type renders its member when present',
  source: `
function InlineObjectPropNullableMember(props: { data: { label: string; count: number } | null }) {
  return <p>{props.data ? props.data.label : 'none'}</p>
}
export { InlineObjectPropNullableMember }
`,
  props: { data: { label: 'y', count: 2 } },
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf-cond-start:s0--><!--bf:s1-->y<!--/--><!--bf-cond-end:s0--></p>
  `,
})
