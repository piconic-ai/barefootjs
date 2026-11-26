import { createFixture } from '../src/types'

/**
 * A destructured prop typed as an inline object type that declares an index signature beside a property, read by the declared property.
 */
export const fixture = createFixture({
  id: 'inline-object-prop-index-signature-destructured',
  description: 'A declared member of a destructured prop typed as an inline object type with an index signature renders its value',
  source: `
function InlineObjectPropIndexSignatureDestructured({ data }: { data: { label: string; [key: string]: string } }) {
  return <p>{data.label}</p>
}
export { InlineObjectPropIndexSignatureDestructured }
`,
  props: { data: { label: 'label' } },
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->label<!--/--></p>
  `,
})
