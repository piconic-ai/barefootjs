import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A prop name that starts with an underscore',
  given: 'a component prop whose name starts with `_` (for example `__bf_root_value`), read in the template',
  expected: 'the prop value renders like any other prop',
  actual: 'throws at render time: the prop becomes an unexported struct field the template cannot read',
  fixtures: ['loop-param-prop-alias-name-collision'],
})
