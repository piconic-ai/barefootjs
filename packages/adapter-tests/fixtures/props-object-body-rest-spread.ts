import { createFixture } from '../src/types'

/**
 * A component-body destructure of the props object with a rest element
 * (`const { label, ...rest } = props`) binds `rest` to the props the caller
 * passed minus `label`, as JS does: spread onto an element and onto a child
 * component, and destructured again (`const { id, label: taken = 'taken' }
 * = rest`, where `label` is not in `rest`). An omitted prop (`title`) stays
 * absent.
 */
export const fixture = createFixture({
  id: 'props-object-body-rest-spread',
  description: 'a props-object body destructure with a rest element binds the remaining props',
  source: `
import { Tag } from './tag'
export function PropsObjectBodyRestSpread(props: { label: string; id?: string; title?: string }) {
  const { label, ...rest } = props
  const { id, label: taken = 'taken' } = rest
  return (
    <div data-id={id}>
      <button {...rest}>{label}|{taken}</button>
      <Tag {...rest} />
    </div>
  )
}
`,
  components: {
    './tag.tsx': `
export function Tag(props: { id?: string; title?: string }) {
  return <b data-id={props.id} data-title={props.title}>t</b>
}
`,
  },
  props: { label: 'Go', id: 'b1' },
  expectedHtml: `
    <div bf-s="test" bf="s3" data-id="b1">
      <button bf="s1" id="b1"><!--bf:s0-->Go<!--/-->|taken</button>
      <b bf-s="test_s2" bf="s0" data-id="b1">t</b>
    </div>
  `,
})
