import { createFixture } from '../src/types'

/**
 * Sibling of `spread-closed-rest-repeated-omitted` for a rest a body
 * destructure of the props object binds: its keys read the props object
 * (`props.id ?? (props.id)`), and the caller omits `id`, so no attribute
 * renders. A caller that passes `id` renders it once per expansion on the
 * template adapters (limitation `closed-rest-repeated`, the generated data
 * points).
 */
export const fixture = createFixture({
  id: 'spread-body-rest-repeated-omitted',
  description: 'A repeated body rest spread renders no attribute for an omitted key',
  source: `
type P = { label?: string; id?: string }
export function SpreadBodyRestRepeatedOmitted(props: P) {
  const { label, ...rest } = props
  return <p {...rest} {...rest}>{label}</p>
}
`,
  props: {},
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0--><!--/--></p>
  `,
})
