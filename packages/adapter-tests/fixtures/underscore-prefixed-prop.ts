import { createFixture } from '../src/types'

/**
 * Props whose names start with one or more underscores render like any other
 * prop, next to an ordinary prop of the same tail (#3336). On go-template a
 * leading `_` has no upper case, so these props need an exported field.
 */
export const fixture = createFixture({
  id: 'underscore-prefixed-prop',
  description: 'Props named with one or more leading underscores render their values',
  source: `
export function UnderscoreProp(props: { value: string; _value: string; __bf_root_value: string }) {
  return <p data-plain={props.value} data-one={props._value} data-other={props.__bf_root_value}>{props._value}</p>
}
`,
  props: { value: 'plain', _value: 'one', __bf_root_value: 'other' },
  expectedHtml: `
    <p bf-s="test" bf="s1" data-one="one" data-other="other" data-plain="plain"><!--bf:s0-->one<!--/--></p>
  `,
})
