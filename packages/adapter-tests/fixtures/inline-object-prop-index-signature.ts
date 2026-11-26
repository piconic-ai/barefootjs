import { createFixture } from '../src/types'

/**
 * A props member typed as an inline object type that declares an index signature beside a property, read by a key no property declares.
 */
export const fixture = createFixture({
  id: 'inline-object-prop-index-signature',
  description: 'A key read through an inline object prop type with an index signature renders its value',
  source: `
function InlineObjectPropIndexSignature(props: { data: { label: string; [key: string]: string } }) {
  return <p>{props.data.label}:{props.data['extra']}</p>
}
export { InlineObjectPropIndexSignature }
`,
  props: { data: { label: 'label', extra: 'extra' } },
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf:s0-->label<!--/-->:<!--bf:s1-->extra<!--/--></p>
  `,
})
